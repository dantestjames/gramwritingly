import { FANCY_DIALOGUE_TAGS, NOT_ADVERBS, SENSES } from "../data/lexicons.js";
import { makeIssue, pct, score } from "../issue.js";
import { isWord, words } from "../tokenise.js";
import type { Issue, ReportResult } from "../types.js";

const QUOTE_RE = /["“]([^"“”]{1,2000})["”]/g;

export function dialogue(text: string): ReportResult {
  const issues: Issue[] = [];
  let dialogueWords = 0;
  let lines = 0;
  QUOTE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = QUOTE_RE.exec(text))) {
    lines++;
    dialogueWords += words(m[1]!).filter((w) => isWord(w.text)).length;
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 60);
    const tagMatch = after.match(/^\s*,?\s*(?:(?:he|she|they|i|we|you|it|[A-Z][a-z]+)\s+)?(\p{L}+)(\s+(\p{L}+ly))?/u);
    if (!tagMatch) continue;
    const verb = tagMatch[1]!.toLowerCase();
    const tagStart = m.index + m[0].length + after.indexOf(tagMatch[1]!);
    if (FANCY_DIALOGUE_TAGS.includes(verb)) {
      issues.push(
        makeIssue({
          offset: tagStart, length: tagMatch[1]!.length, rule: "fancy-dialogue-tag", category: "style",
          report: "dialogue", title: "Showy dialogue tag",
          message: `"${tagMatch[1]}" draws attention to itself. "Said" disappears, or use an action beat instead.`,
          replacements: ["said"],
        }),
      );
    }
    const adv = tagMatch[3];
    if (adv && !NOT_ADVERBS.has(adv.toLowerCase()) && /^(said|asked|replied|whispered|shouted|says|asks)$/.test(verb)) {
      const advStart = m.index + m[0].length + after.indexOf(adv, after.indexOf(tagMatch[1]!));
      issues.push(
        makeIssue({
          offset: advStart, length: adv.length, rule: "dialogue-adverb", category: "style", report: "dialogue",
          title: "Adverb on dialogue tag",
          message: `"${tagMatch[1]} ${adv}" tells the reader how it was said. Let the words or an action show it.`,
          replacements: [""],
        }),
      );
    }
  }
  const total = words(text).filter((w) => isWord(w.text)).length;
  return {
    id: "dialogue", title: "Dialogue",
    summary: lines ? `${lines} lines of dialogue, ${pct(dialogueWords, total)}% of words.` : "No dialogue found.",
    score: score(100 - issues.length * 6), issues,
    metrics: { lines, dialogueShare: pct(dialogueWords, total), tagIssues: issues.length },
  };
}

export function sensory(text: string): ReportResult {
  const ws = words(text).filter((w) => isWord(w.text));
  const metrics: Record<string, number> = {};
  const issues: Issue[] = [];
  const lookup = new Map<string, keyof typeof SENSES>();
  for (const [sense, list] of Object.entries(SENSES) as [keyof typeof SENSES, string[]][]) {
    metrics[sense] = 0;
    for (const w of list) if (!lookup.has(w)) lookup.set(w, sense);
  }
  for (const w of ws) {
    const sense = lookup.get(w.text.toLowerCase());
    if (!sense) continue;
    metrics[sense] = (metrics[sense] ?? 0) + 1;
    issues.push(
      makeIssue({
        offset: w.start, length: w.end - w.start, rule: `sense-${sense}`, category: "style", report: "sensory",
        title: `Sense: ${sense}`, message: `"${w.text}" appeals to ${sense}.`,
      }),
    );
  }
  const used = Object.values(metrics).filter((n) => n > 0).length;
  const missing = (Object.keys(SENSES) as string[]).filter((s) => !metrics[s]);
  return {
    id: "sensory", title: "Sensory",
    summary: missing.length ? `Senses not used: ${missing.join(", ")}.` : "All five senses appear.",
    score: score(used * 20), issues, metrics,
  };
}
