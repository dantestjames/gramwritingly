import type { HighlightKind, Issue, IssueCategory, ReportId, Severity } from "./types.js";
import { matchCase, phraseRegex } from "./tokenise.js";

export interface MakeIssue {
  offset: number;
  length: number;
  rule: string;
  category: IssueCategory;
  message: string;
  title?: string;
  replacements?: string[];
  severity?: Severity;
  report?: ReportId;
  highlight?: HighlightKind;
}

export function makeIssue(i: MakeIssue): Issue {
  return {
    id: `${i.rule}:${i.offset}:${i.length}`,
    offset: i.offset,
    length: i.length,
    category: i.category,
    rule: i.rule,
    report: i.report,
    message: i.message,
    title: i.title,
    replacements: i.replacements ?? [],
    severity: i.severity ?? "info",
    source: "core",
    highlight: i.highlight,
  };
}

export interface PhraseHit {
  offset: number;
  length: number;
  text: string;
  key: string;
}

/** Finds every occurrence of any phrase. `key` is the lower-case list entry that matched. */
export function findPhrases(text: string, phrases: string[]): PhraseHit[] {
  if (phrases.length === 0) return [];
  const re = phraseRegex(phrases);
  const lookup = new Map(phrases.map((p) => [norm(p), p]));
  const hits: PhraseHit[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const key = lookup.get(norm(m[0])) ?? norm(m[0]);
    hits.push({ offset: m.index, length: m[0].length, text: m[0], key });
  }
  return hits;
}

function norm(s: string) {
  return s.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ");
}

/** Phrase list with suggested replacements, producing issues. */
export function phraseIssues(
  text: string,
  map: Record<string, string>,
  base: Omit<MakeIssue, "offset" | "length" | "message" | "replacements"> & {
    message: (hit: PhraseHit, replacement: string) => string;
  },
): Issue[] {
  return findPhrases(text, Object.keys(map)).map((hit) => {
    const rep = map[hit.key] ?? "";
    return makeIssue({
      ...base,
      offset: hit.offset,
      length: hit.length,
      message: base.message(hit, rep),
      replacements: rep ? [matchCase(hit.text, rep)] : [],
    });
  });
}

/** Clamp to 0..100 and round. */
export function score(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function per1000(count: number, totalWords: number): number {
  if (totalWords === 0) return 0;
  return (count / totalWords) * 1000;
}

export function pct(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}
