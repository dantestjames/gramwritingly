import { PLANS, sentences } from "@gramwritingly/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireFeature, requireUser, type Deps } from "../lib/context.js";
import {
  critiquePrompt, detectPrompt, feedbackPrompt, parseJson, REWRITE_MODES, rewritePrompt, SPARK_KINDS, sparkPrompt,
  synonymsPrompt, type RewriteMode, type SparkKind,
} from "../services/ai.js";
import { addUsage, assertQuota, getUsage } from "../services/usage.js";
import { LanguageSchema } from "./check.js";

const Rewrite = z.object({
  text: z.string().min(1).max(8000),
  mode: z.enum(Object.keys(REWRITE_MODES) as [RewriteMode, ...RewriteMode[]]),
  instruction: z.string().max(500).optional(),
  language: LanguageSchema.optional(),
});

const Feedback = z.object({
  text: z.string().min(20).max(120_000),
  documentType: z.string().max(30).optional(),
  language: LanguageSchema.optional(),
});

const Critique = z.object({
  text: z.string().min(200).max(60_000),
  genre: z.string().max(60).optional(),
  language: LanguageSchema.optional(),
});

const Spark = z.object({
  text: z.string().max(20_000),
  kind: z.enum(Object.keys(SPARK_KINDS) as [SparkKind, ...SparkKind[]]),
  language: LanguageSchema.optional(),
});

const Synonyms = z.object({
  word: z.string().min(1).max(60),
  context: z.string().max(1000),
  language: LanguageSchema.optional(),
});

const Detect = z.object({ text: z.string().min(50).max(30_000) });

/** Daily fair-use cap for "unlimited" document feedback. */
const FEEDBACK_PER_DAY = 50;

const thesaurusCache = new Map<string, string[]>();

export function aiRoutes(app: FastifyInstance, { db, ai }: Deps) {
  const lang = (l: string | undefined, fallback: string | undefined) => l ?? fallback ?? "en-AU";

  app.post("/ai/rewrite", async (req) => {
    const user = requireUser(req);
    const body = Rewrite.parse(req.body);
    if (body.mode !== "fix") {
      const feature = body.mode === "custom" ? "aiCustomRequest" : body.mode === "fluency" ? "aiFluency" : "aiToneAdjust";
      requireFeature(user, feature);
    }
    const credits = Math.max(1, sentences(body.text).length);
    assertQuota(db, user.id, "ai_credits", PLANS[user.plan].limits.aiCreditsPerMonth, credits);
    const p = rewritePrompt(body.mode, body.text, lang(body.language, user.settings.language), body.instruction, user.settings.voiceSample);
    const raw = await ai.complete({ tier: "fast", ...p, maxTokens: Math.min(4000, 400 + body.text.length) });
    const out = parseJson<{ variants: string[]; explanation?: string }>(raw);
    addUsage(db, user.id, "ai_credits", credits);
    return {
      variants: (out.variants ?? []).filter((v) => typeof v === "string" && v.trim()).slice(0, 3),
      explanation: out.explanation ?? "",
      creditsUsed: credits,
      creditsLeft: remaining(PLANS[user.plan].limits.aiCreditsPerMonth, getUsage(db, user.id, "ai_credits")),
    };
  });

  app.post("/ai/feedback", async (req) => {
    const user = requireUser(req);
    requireFeature(user, "documentFeedback");
    const body = Feedback.parse(req.body);
    assertQuota(db, user.id, "feedback", FEEDBACK_PER_DAY);
    const p = feedbackPrompt(body.text, body.documentType ?? "general", lang(body.language, user.settings.language));
    const out = parseJson(await ai.complete({ tier: "deep", ...p, maxTokens: 3000 }));
    addUsage(db, user.id, "feedback", 1);
    return out;
  });

  app.post("/ai/critique", async (req) => {
    const user = requireUser(req);
    requireFeature(user, "chapterCritique");
    const body = Critique.parse(req.body);
    assertQuota(db, user.id, "critiques", PLANS[user.plan].limits.chapterCritiquesPerDay);
    const p = critiquePrompt(body.text, body.genre ?? "", lang(body.language, user.settings.language));
    const out = parseJson(await ai.complete({ tier: "deep", ...p, maxTokens: 3500 }));
    addUsage(db, user.id, "critiques", 1);
    return out;
  });

  app.post("/ai/sparks", async (req) => {
    const user = requireUser(req);
    requireFeature(user, "aiSparks");
    const body = Spark.parse(req.body);
    assertQuota(db, user.id, "sparks", PLANS[user.plan].limits.sparksPerDay);
    const p = sparkPrompt(body.kind, body.text, lang(body.language, user.settings.language));
    const out = parseJson<{ ideas: string[] }>(await ai.complete({ tier: "fast", ...p, maxTokens: 1200 }));
    addUsage(db, user.id, "sparks", 1);
    return { ideas: out.ideas ?? [] };
  });

  app.post("/ai/synonyms", async (req) => {
    const user = requireUser(req);
    requireFeature(user, "aiSynonyms");
    const body = Synonyms.parse(req.body);
    const p = synonymsPrompt(body.word, body.context, lang(body.language, user.settings.language));
    const out = parseJson<{ synonyms: string[] }>(await ai.complete({ tier: "fast", ...p, maxTokens: 300 }));
    return { synonyms: (out.synonyms ?? []).slice(0, 8) };
  });

  app.post("/ai/detect", async (req) => {
    const user = requireUser(req);
    requireFeature(user, "aiDetection");
    const body = Detect.parse(req.body);
    const out = parseJson<{ likelihood: number }>(await ai.complete({ tier: "deep", ...detectPrompt(body.text), maxTokens: 1500 }));
    return {
      ...out,
      note: "AI detection is an estimate, not proof. Never use it as the only basis for a decision about someone's work.",
    };
  });

  /** Free word explorer and thesaurus via the Datamuse API. No AI credits used. */
  app.get("/thesaurus", async (req) => {
    const { word } = z.object({ word: z.string().min(1).max(60) }).parse(req.query);
    const key = word.toLowerCase();
    if (thesaurusCache.has(key)) return { word, synonyms: thesaurusCache.get(key) };
    const url = `https://api.datamuse.com/words?ml=${encodeURIComponent(key)}&max=24`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { word, synonyms: [] };
    const data = (await res.json()) as { word: string; tags?: string[] }[];
    const synonyms = data.filter((d) => d.tags?.includes("syn") ?? true).map((d) => d.word).slice(0, 20);
    if (thesaurusCache.size > 5000) thesaurusCache.clear();
    thesaurusCache.set(key, synonyms);
    return { word, synonyms };
  });
}

function remaining(limit: number, used: number) {
  return Number.isFinite(limit) ? Math.max(0, limit - used) : null;
}
