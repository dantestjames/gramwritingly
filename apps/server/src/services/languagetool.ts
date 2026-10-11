import type { Issue, IssueCategory } from "@gramwritingly/core";

export interface LanguageToolClient {
  check(text: string, language: string, opts?: { picky?: boolean }): Promise<Issue[]>;
  available(): Promise<boolean>;
}

interface LTMatch {
  message: string;
  shortMessage?: string;
  offset: number;
  length: number;
  replacements: { value: string }[];
  rule: { id: string; description: string; issueType?: string; category?: { id: string; name: string } };
}

const CHUNK = 15000;

function category(m: LTMatch): IssueCategory {
  const type = m.rule.issueType ?? "";
  const cat = m.rule.category?.id ?? "";
  if (type === "misspelling" || cat === "TYPOS") return "spelling";
  if (type === "typographical" || cat === "PUNCTUATION" || cat === "TYPOGRAPHY") return "punctuation";
  if (type === "style" || cat === "STYLE" || cat === "REDUNDANCY" || cat === "PLAIN_ENGLISH") return "style";
  if (cat === "CASING") return "grammar";
  return "grammar";
}

/** Splits long text on paragraph breaks so each request stays under the server limit. */
export function chunkText(text: string, size = CHUNK): { offset: number; text: string }[] {
  if (text.length <= size) return [{ offset: 0, text }];
  const out: { offset: number; text: string }[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + size);
    if (end < text.length) {
      const br = text.lastIndexOf("\n", end);
      if (br > start + size / 2) end = br + 1;
      else {
        const sp = text.lastIndexOf(" ", end);
        if (sp > start) end = sp + 1;
      }
    }
    out.push({ offset: start, text: text.slice(start, end) });
    start = end;
  }
  return out;
}

export function createLanguageTool(baseUrl: string, fetchImpl: typeof fetch = fetch): LanguageToolClient {
  return {
    async available() {
      try {
        const r = await fetchImpl(`${baseUrl}/v2/languages`, { signal: AbortSignal.timeout(2000) });
        return r.ok;
      } catch {
        return false;
      }
    },
    async check(text, language, opts = {}) {
      const issues: Issue[] = [];
      for (const chunk of chunkText(text)) {
        const body = new URLSearchParams({ text: chunk.text, language, enabledOnly: "false" });
        if (opts.picky) body.set("level", "picky");
        const res = await fetchImpl(`${baseUrl}/v2/check`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body,
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`LanguageTool returned ${res.status}`);
        const data = (await res.json()) as { matches: LTMatch[] };
        for (const m of data.matches) {
          const offset = m.offset + chunk.offset;
          issues.push({
            id: `LT:${m.rule.id}:${offset}:${m.length}`,
            offset,
            length: m.length,
            category: category(m),
            rule: `LT:${m.rule.id}`,
            message: m.message,
            title: m.shortMessage || m.rule.category?.name || "Grammar",
            replacements: m.replacements.slice(0, 5).map((r) => r.value),
            severity: category(m) === "spelling" || category(m) === "grammar" ? "error" : "warning",
            source: "languagetool",
          });
        }
      }
      return issues;
    },
  };
}
