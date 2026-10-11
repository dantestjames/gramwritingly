import { analyse, mergeIssues, underlineColour, type Issue, type Language } from "@gramwritingly/core";

/** Issue shape understood by the native helper (see docs/desktop-protocol.md). */
export interface WireIssue {
  id: string;
  offset: number;
  length: number;
  colour: string;
  title: string;
  message: string;
  replacements: string[];
  sentence: boolean;
}

const HIDDEN_HIGHLIGHTS = new Set(["hard", "simpler", "adverb", "passive", "weak"]);

/**
 * Turns engine issues into what the helper draws. Readability colour highlights stay in the
 * web editor; in other apps we only underline things worth fixing, plus very hard sentences,
 * which the helper lists with an AI rewrite option.
 */
export function toWire(issues: Issue[]): WireIssue[] {
  return issues
    .filter((i) => !(i.highlight && HIDDEN_HIGHLIGHTS.has(i.highlight)))
    .filter((i) => i.category !== "readability" || i.highlight === "very-hard")
    .slice(0, 200)
    .map((i) => ({
      id: i.id,
      offset: i.offset,
      length: i.length,
      colour: underlineColour(i),
      title: i.title ?? i.category,
      message: i.message,
      replacements: i.replacements.slice(0, 3),
      sentence: i.highlight === "very-hard" || (i.length > 60 && i.replacements.length === 0),
    }));
}

export interface CheckDeps {
  /** Calls the API /check. Rejects when the server can't be reached. */
  serverCheck(text: string, language: Language): Promise<{ issues: Issue[] }>;
}

/**
 * Checks text the same way the web editor does: the offline engine always runs, and the server
 * adds LanguageTool spelling and grammar when it is reachable.
 */
export async function checkText(
  text: string,
  opts: { language: Language; dictionary: string[] },
  deps: CheckDeps,
): Promise<{ issues: WireIssue[]; source: "server" | "local" }> {
  const local = analyse(text, { language: opts.language, plan: "free", dictionary: opts.dictionary });
  try {
    const server = await deps.serverCheck(text, opts.language);
    const dict = new Set(opts.dictionary.map((w) => w.toLowerCase()));
    const serverOnly = server.issues.filter(
      (i) => i.source !== "core" && !(i.category === "spelling" && dict.has(text.slice(i.offset, i.offset + i.length).toLowerCase())),
    );
    return { issues: toWire(mergeIssues(serverOnly, server.issues.filter((i) => i.source === "core"))), source: "server" };
  } catch {
    return { issues: toWire(local.issues), source: "local" };
  }
}
