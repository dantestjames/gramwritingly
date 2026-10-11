import type { Issue } from "@gramwritingly/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import type { AiService, CompletionRequest } from "../src/services/ai.js";
import { chunkText, type LanguageToolClient } from "../src/services/languagetool.js";
import type { PlagiarismProvider } from "../src/services/plagiarism.js";

const ltIssue: Issue = {
  id: "LT:MORFOLOGIK:4:5", offset: 4, length: 5, category: "spelling", rule: "LT:MORFOLOGIK_RULE_EN_AU",
  message: "Possible spelling mistake found.", replacements: ["quick"], severity: "error", source: "languagetool",
};

let ltUp = true;
const lt: LanguageToolClient = {
  async available() { return ltUp; },
  async check(text) {
    if (!ltUp) throw new Error("down");
    return text.includes("quikc") ? [ltIssue] : [];
  },
};

const calls: CompletionRequest[] = [];
const ai: AiService = {
  configured: true,
  async complete(req) {
    calls.push(req);
    if (req.prompt.includes("Return JSON: {\"variants\"")) return '```json\n{"variants": ["Rewritten one.", "Rewritten two."], "explanation": "Shorter."}\n```';
    if (req.prompt.includes('"ideas"')) return '{"ideas": ["Idea A", "Idea B"]}';
    if (req.prompt.includes('"likelihood"')) return '{"likelihood": 40, "signals": []}';
    return '{"overall": "Solid.", "priorities": []}';
  },
};

const submitted: string[] = [];
const plagiarism: PlagiarismProvider = {
  name: "copyleaks",
  configured: true,
  async submit(scanId, _text, cb) { submitted.push(cb.replace("{STATUS}", "completed")); },
  parseCompleted: () => ({ score: 12, totalWords: 40, matches: [{ url: "https://example.com", title: "Example", matchedWords: 5, identicalWords: 5 }] }),
};

const config = { ...loadConfig({}), databasePath: ":memory:", publicApiUrl: "http://api.test" };
const db = openDb(":memory:");
let app: Awaited<ReturnType<typeof buildApp>>;

async function register(email: string) {
  const res = await app.inject({ method: "POST", url: "/auth/register", payload: { email, password: "correct horse battery" } });
  return res.json().token as string;
}

beforeAll(async () => {
  app = await buildApp({ config, db, lt, ai, plagiarism });
});
afterAll(() => app.close());

describe("health and check", () => {
  it("reports service status", async () => {
    const res = await app.inject("/health");
    expect(res.json()).toMatchObject({ ok: true, languageTool: true, ai: true });
  });

  it("merges LanguageTool and core issues anonymously", async () => {
    const res = await app.inject({
      method: "POST", url: "/check",
      payload: { text: "The quikc report was written by the team. We will utilise the color scheme." },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.grammarStatus).toBe("ok");
    expect(body.plan).toBe("free");
    const rules = body.issues.map((i: Issue) => i.rule);
    expect(rules).toContain("LT:MORFOLOGIK_RULE_EN_AU");
    expect(rules).toContain("passive-voice");
    expect(rules).toContain("dialect-spelling");
    expect(body.counts.correctness).toBeGreaterThan(0);
  });

  it("still returns style results when LanguageTool is down", async () => {
    ltUp = false;
    const res = await app.inject({ method: "POST", url: "/check", payload: { text: "It was decided by the board." } });
    ltUp = true;
    expect(res.json().grammarStatus).toBe("unavailable");
    expect(res.json().issues.length).toBeGreaterThan(0);
  });

  it("rejects bad input", async () => {
    const res = await app.inject({ method: "POST", url: "/check", payload: { text: 5 } });
    expect(res.statusCode).toBe(400);
  });
});

describe("accounts, gating and credits", () => {
  let token = "";
  beforeAll(async () => { token = await register("free@example.com"); });
  const auth = () => ({ authorization: `Bearer ${token}` });

  it("returns the user and plan limits", async () => {
    const res = await app.inject({ url: "/me", headers: auth() });
    expect(res.json().plan.id).toBe("free");
    expect(res.json().plan.limits.aiCreditsPerMonth).toBe(100);
  });

  it("rejects a wrong password", async () => {
    const res = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "free@example.com", password: "nope-nope" } });
    expect(res.statusCode).toBe(401);
  });

  it("lets Free users fix sentences with AI and meters credits per sentence", async () => {
    const res = await app.inject({
      method: "POST", url: "/ai/rewrite", headers: auth(),
      payload: { text: "This is one. This is two.", mode: "fix" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().variants).toEqual(["Rewritten one.", "Rewritten two."]);
    expect(res.json().creditsUsed).toBe(2);
    expect(res.json().creditsLeft).toBe(98);
  });

  it("blocks tone adjustment, plagiarism and style guides on Free", async () => {
    const tone = await app.inject({ method: "POST", url: "/ai/rewrite", headers: auth(), payload: { text: "Hi.", mode: "formal" } });
    expect(tone.statusCode).toBe(403);
    expect(tone.json().error).toBe("pro_required");
    const plag = await app.inject({ method: "POST", url: "/plagiarism", headers: auth(), payload: { text: "x ".repeat(30) } });
    expect(plag.statusCode).toBe(403);
    const guide = await app.inject({ method: "PUT", url: "/styleguide", headers: auth(), payload: { name: "House", rules: [] } });
    expect(guide.statusCode).toBe(403);
  });

  it("requires sign-in for AI", async () => {
    const res = await app.inject({ method: "POST", url: "/ai/rewrite", payload: { text: "Hi.", mode: "fix" } });
    expect(res.statusCode).toBe(401);
  });

  it("enforces the monthly credit cap", async () => {
    db.prepare("UPDATE usage SET amount = 100 WHERE kind = 'ai_credits'").run();
    const res = await app.inject({ method: "POST", url: "/ai/rewrite", headers: auth(), payload: { text: "One more.", mode: "fix" } });
    expect(res.statusCode).toBe(402);
    expect(res.json().error).toBe("quota");
  });

  it("stores documents and the personal dictionary", async () => {
    const created = await app.inject({ method: "POST", url: "/documents", headers: auth(), payload: { title: "Draft", content: "Hello" } });
    const id = created.json().id;
    const updated = await app.inject({ method: "PUT", url: `/documents/${id}`, headers: auth(), payload: { content: "Hello world" } });
    expect(updated.json().content).toBe("Hello world");
    await app.inject({ method: "POST", url: "/dictionary", headers: auth(), payload: { word: "quikc" } });
    const check = await app.inject({ method: "POST", url: "/check", headers: auth(), payload: { text: "The quikc fox." } });
    expect(check.json().issues.some((i: Issue) => i.source === "languagetool")).toBe(false);
  });
});

describe("quota races", () => {
  it("lets only one of several parallel requests spend the last credit", async () => {
    const token = await register("race@example.com");
    const id = (db.prepare("SELECT id FROM users WHERE email = 'race@example.com'").get() as { id: string }).id;
    db.prepare("INSERT INTO usage (user_id, kind, period, amount) VALUES (?, 'ai_credits', ?, 99)").run(id, new Date().toISOString().slice(0, 7));
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        app.inject({ method: "POST", url: "/ai/rewrite", headers: { authorization: `Bearer ${token}` }, payload: { text: "One.", mode: "fix" } }),
      ),
    );
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(results.filter((r) => r.statusCode === 402)).toHaveLength(5);
  });

  it("bills long unpunctuated text by length", async () => {
    const { rewriteCredits } = await import("../src/routes/ai.js");
    expect(rewriteCredits("word ".repeat(400))).toBe(7);
    expect(rewriteCredits("Short. Two.")).toBe(2);
  });
});

describe("Pro features", () => {
  let token = "";
  beforeAll(async () => {
    token = await register("pro@example.com");
    db.prepare("UPDATE users SET plan = 'pro' WHERE email = 'pro@example.com'").run();
  });
  const auth = () => ({ authorization: `Bearer ${token}` });

  it("applies the user's style guide during checks", async () => {
    const put = await app.inject({
      method: "PUT", url: "/styleguide", headers: auth(),
      payload: { name: "Clickstarter style", rules: [{ term: "customers", replacement: "clients" }] },
    });
    expect(put.statusCode).toBe(200);
    const res = await app.inject({ method: "POST", url: "/check", headers: auth(), payload: { text: "Our customers are great." } });
    expect(res.json().issues.some((i: Issue) => i.category === "styleguide" && i.replacements[0] === "clients")).toBe(true);
  });

  it("runs plagiarism scans and accepts only signed webhooks", async () => {
    const res = await app.inject({ method: "POST", url: "/plagiarism", headers: auth(), payload: { text: "word ".repeat(40) } });
    expect(res.statusCode).toBe(200);
    const scanId = res.json().scanId;
    const hook = new URL(submitted[0]!);
    const forged = await app.inject({ method: "POST", url: `/webhooks/copyleaks/completed/${scanId}/forged-signature-forged-signatu`, payload: {} });
    expect(forged.statusCode).toBe(404);
    const ok = await app.inject({ method: "POST", url: hook.pathname, payload: {} });
    expect(ok.statusCode).toBe(200);
    const result = await app.inject({ url: `/plagiarism/${scanId}`, headers: auth() });
    expect(result.json()).toMatchObject({ status: "completed", result: { score: 12 } });
  });

  it("uses the deep model for document feedback and the fast model for sparks", async () => {
    calls.length = 0;
    await app.inject({ method: "POST", url: "/ai/feedback", headers: auth(), payload: { text: "A reasonably long document body for review." } });
    await app.inject({ method: "POST", url: "/ai/sparks", headers: auth(), payload: { text: "Once upon a time", kind: "continue" } });
    expect(calls.map((c) => c.tier)).toEqual(["deep", "fast"]);
  });

  it("adds a caution note to AI detection", async () => {
    const res = await app.inject({ method: "POST", url: "/ai/detect", headers: auth(), payload: { text: "x".repeat(60) } });
    expect(res.json().note).toMatch(/estimate/);
  });
});

describe("LanguageTool chunking", () => {
  it("splits long text on line breaks and keeps offsets", () => {
    const text = `${"a".repeat(9000)}\n${"b".repeat(9000)}`;
    const chunks = chunkText(text, 15000);
    expect(chunks).toHaveLength(2);
    expect(chunks[1]!.offset).toBe(9001);
  });
});
