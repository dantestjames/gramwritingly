import type { Issue } from "./types.js";

const PRIORITY: Record<Issue["category"], number> = {
  spelling: 0, grammar: 1, punctuation: 2, styleguide: 3, consistency: 4, inclusive: 5,
  clarity: 6, style: 7, tone: 8, readability: 9,
};

/**
 * Combines issue lists from several sources. When two issues cover the same text with the
 * same intent, the higher-priority one wins (LanguageTool spelling beats our dialect check).
 * Whole-sentence readability highlights never block word-level issues.
 */
export function mergeIssues(...lists: Issue[][]): Issue[] {
  const all = lists.flat().sort((a, b) => PRIORITY[a.category] - PRIORITY[b.category]);
  const kept: Issue[] = [];
  for (const issue of all) {
    const clash = kept.some(
      (k) =>
        k.offset === issue.offset &&
        k.length === issue.length &&
        (k.category === issue.category ||
          (k.category === "spelling" && issue.rule === "dialect-spelling") ||
          (k.replacements[0] !== undefined && k.replacements[0] === issue.replacements[0])),
    );
    if (!clash) kept.push(issue);
  }
  return kept.sort((a, b) => a.offset - b.offset || b.length - a.length);
}

/** Applies one replacement to text. Returns the new text and the length delta. */
export function applyFix(text: string, issue: Pick<Issue, "offset" | "length">, replacement: string) {
  let start = issue.offset;
  let end = issue.offset + issue.length;
  // Removing a word: also remove one adjoining space so we do not leave "a  b".
  if (replacement === "") {
    if (text[end] === " " && (start === 0 || text[start - 1] === " ")) end++;
    else if (text[start - 1] === " ") start--;
  }
  const next = text.slice(0, start) + replacement + text.slice(end);
  return { text: next, delta: replacement.length - (end - start), start };
}

/** Shifts issue offsets after an edit so remaining underlines stay in place until the next check. */
export function shiftIssues(issues: Issue[], editStart: number, editEnd: number, delta: number): Issue[] {
  return issues
    .filter((i) => i.offset + i.length <= editStart || i.offset >= editEnd)
    .map((i) => (i.offset >= editEnd ? { ...i, offset: i.offset + delta, id: `${i.rule}:${i.offset + delta}:${i.length}` } : i));
}
