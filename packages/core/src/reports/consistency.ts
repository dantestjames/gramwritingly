import { COMMON_ACRONYMS, HOMONYMS, INCLUSIVE } from "../data/lexicons.js";
import { IZE_EXCEPTIONS, UK_TO_US_WORDS, US_TO_UK_WORDS } from "../data/spelling-variants.js";
import { makeIssue, phraseIssues, score } from "../issue.js";
import { matchCase, sentences, words } from "../tokenise.js";
import type { Issue, Language, ReportResult } from "../types.js";

const COMMONWEALTH: Language[] = ["en-AU", "en-GB", "en-NZ", "en-ZA"];

const LANGUAGE_NAMES: Record<Language, string> = {
  "en-AU": "Australian English", "en-GB": "British English", "en-NZ": "New Zealand English",
  "en-ZA": "South African English", "en-US": "US English", "en-CA": "Canadian English",
};

/** Returns the preferred spelling for this dialect, or null if the word is fine. */
export function dialectSpelling(word: string, language: Language): string | null {
  const lower = word.toLowerCase();
  if (COMMONWEALTH.includes(language)) {
    const direct = US_TO_UK_WORDS[lower];
    if (direct && direct !== lower) return matchCase(word, direct);
    if (!IZE_EXCEPTIONS.has(lower)) {
      const m = lower.match(/^(\p{L}{3,})iz(e|es|ed|ing|ation|ations|er|ers)$/u);
      if (m) return matchCase(word, `${m[1]}is${m[2]}`);
      const y = lower.match(/^(anal|paral|catal|electrol|dial|hydrol)yz(e|es|ed|ing)$/);
      if (y) return matchCase(word, `${y[1]}ys${y[2]}`);
    }
    return null;
  }
  if (language === "en-US") {
    const direct = UK_TO_US_WORDS[lower];
    if (direct) return matchCase(word, direct);
    const m = lower.match(/^(\p{L}{3,})is(e|es|ed|ing|ation|ations)$/u);
    // Only convert -ise words we know are -ize in US English (avoid "promise", "exercise", "advise").
    if (m && /(organ|real|recogn|special|apolog|emphas|summar|categor|priorit|optim|minim|maxim|util|standard|author|critic|final|general|global|modern|normal|personal|visual|custom|memor|central|digit)$/.test(m[1]!)) {
      return matchCase(word, `${m[1]}iz${m[2]}`);
    }
  }
  return null; // en-CA mixes both systems; leave it alone.
}

export function consistency(text: string, language: Language): ReportResult {
  const issues: Issue[] = [];
  const ws = words(text);

  // 1. Dialect spelling
  for (const w of ws) {
    const fix = dialectSpelling(w.text, language);
    if (fix && fix !== w.text) {
      issues.push(
        makeIssue({
          offset: w.start, length: w.end - w.start, rule: "dialect-spelling", category: "consistency",
          report: "consistency", severity: "warning", title: "Spelling variant",
          message: `"${w.text}" is the ${language === "en-US" ? "Commonwealth" : "US"} spelling. ${LANGUAGE_NAMES[language]} uses "${fix}".`,
          replacements: [fix],
        }),
      );
    }
  }

  // 2. Hyphenation mixes: e-mail vs email, well-being vs wellbeing vs well being
  const lowerText = text.toLowerCase();
  const hyphenated = new Map<string, { start: number; end: number; text: string }[]>();
  for (const w of ws) {
    if (!w.text.includes("-")) continue;
    const k = w.text.toLowerCase();
    const list = hyphenated.get(k) ?? [];
    list.push(w);
    hyphenated.set(k, list);
  }
  for (const [k, occurrences] of hyphenated) {
    const closed = k.replace(/-/g, "");
    const open = k.replace(/-/g, " ");
    const closedHits = countWord(lowerText, closed);
    const openHits = countWord(lowerText, open);
    if (closedHits + openHits === 0) continue;
    const other = closedHits >= openHits ? closed : open;
    for (const o of occurrences) {
      issues.push(
        makeIssue({
          offset: o.start, length: o.end - o.start, rule: "hyphenation-mix", category: "consistency",
          report: "consistency", title: "Inconsistent hyphenation",
          message: `You write both "${o.text}" and "${other}". Pick one.`,
          replacements: [matchCase(o.text, other)],
        }),
      );
    }
  }

  // 3. Capitalisation mixes (mid-sentence only)
  const sentenceStarts = new Set(sentences(text).map((s) => s.start));
  const forms = new Map<string, Map<string, { start: number; end: number }[]>>();
  for (const w of ws) {
    if (w.text.length < 4 || sentenceStarts.has(w.start) || /^[A-Z]+$/.test(w.text)) continue;
    const prev = text.slice(Math.max(0, w.start - 2), w.start);
    if (/["“(]/.test(prev)) continue;
    const k = w.text.toLowerCase();
    const byForm = forms.get(k) ?? new Map();
    const list = byForm.get(w.text) ?? [];
    list.push(w);
    byForm.set(w.text, list);
    forms.set(k, byForm);
  }
  for (const [, byForm] of forms) {
    if (byForm.size < 2) continue;
    const ranked = [...byForm].sort((a, b) => b[1].length - a[1].length);
    const preferred = ranked[0]![0];
    for (const [form, list] of ranked.slice(1)) {
      for (const o of list) {
        issues.push(
          makeIssue({
            offset: o.start, length: o.end - o.start, rule: "capitalisation-mix", category: "consistency",
            report: "consistency", title: "Inconsistent capitals",
            message: `"${form}" is capitalised differently elsewhere ("${preferred}").`,
            replacements: [preferred],
          }),
        );
      }
    }
  }

  // 4. Straight vs curly quotes
  const straight = [...text.matchAll(/"/g)].map((m) => m.index!);
  const curly = (text.match(/[“”]/g) ?? []).length;
  if (straight.length && curly) {
    const minority = straight.length < curly ? straight : [];
    for (const idx of minority) {
      issues.push(
        makeIssue({
          offset: idx, length: 1, rule: "quote-mix", category: "consistency", report: "consistency",
          title: "Mixed quote marks", message: "Straight and curly quote marks are mixed. Use one style.",
        }),
      );
    }
  }

  // 5. Double spaces
  for (const m of text.matchAll(/(?<=\S) {2,}(?=\S)/g)) {
    issues.push(
      makeIssue({
        offset: m.index!, length: m[0].length, rule: "double-space", category: "punctuation", report: "consistency",
        title: "Extra space", message: "Use one space between words and after full stops.", replacements: [" "],
      }),
    );
  }

  // 6. Spelled-out vs numeral style for numbers under ten
  const numerals = [...text.matchAll(/(?<![\d.,])\b[2-9]\b(?![\d.,%:])/g)];
  const spelled = (text.match(/\b(two|three|four|five|six|seven|eight|nine)\b/gi) ?? []).length;
  if (numerals.length && spelled) {
    for (const m of numerals) {
      const names = ["", "", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
      issues.push(
        makeIssue({
          offset: m.index!, length: 1, rule: "number-style", category: "consistency", report: "consistency",
          title: "Number style", message: "Numbers under ten are written both as words and digits. Most style guides spell them out.",
          replacements: [names[Number(m[0])]!],
        }),
      );
    }
  }

  const spellingCount = issues.filter((i) => i.rule === "dialect-spelling").length;
  return {
    id: "consistency", title: "Consistency",
    summary: issues.length
      ? `${issues.length} inconsistenc${issues.length === 1 ? "y" : "ies"}, including ${spellingCount} spelling variant${spellingCount === 1 ? "" : "s"}.`
      : `Consistent throughout (${LANGUAGE_NAMES[language]}).`,
    score: score(100 - issues.length * 4), issues,
    metrics: { total: issues.length, spellingVariants: spellingCount },
  };
}

function countWord(haystack: string, needle: string) {
  if (!needle) return 0;
  const re = new RegExp(`(?<![\\p{L}-])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}-])`, "gu");
  return (haystack.match(re) ?? []).length;
}

export function inclusive(text: string): ReportResult {
  const issues = phraseIssues(text, INCLUSIVE, {
    rule: "inclusive-language", category: "inclusive", report: "inclusive", severity: "warning",
    title: "Inclusive language",
    message: (h, r) => `"${h.text}" may exclude or offend some readers. Consider "${r}".`,
  });
  return {
    id: "inclusive", title: "Inclusive language",
    summary: issues.length ? `${issues.length} term${issues.length === 1 ? "" : "s"} to reconsider.` : "Nothing flagged.",
    score: score(100 - issues.length * 10), issues, metrics: { flagged: issues.length },
  };
}

export function homonyms(text: string): ReportResult {
  const keys = Object.keys(HOMONYMS);
  const lookup = new Set(keys);
  const issues: Issue[] = [];
  for (const w of words(text)) {
    const k = w.text.toLowerCase().replace(/’/g, "'");
    if (!lookup.has(k)) continue;
    issues.push(
      makeIssue({
        offset: w.start, length: w.end - w.start, rule: "homonym", category: "grammar", report: "homonyms",
        title: "Check the word", message: `Easily confused: ${HOMONYMS[k]}. Make sure "${w.text}" is the one you mean.`,
      }),
    );
  }
  return {
    id: "homonyms", title: "Homonyms",
    summary: `${issues.length} easily confused word${issues.length === 1 ? "" : "s"} to double-check.`,
    issues, metrics: { count: issues.length },
  };
}

export function acronyms(text: string): ReportResult {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/(?<![\p{L}])([A-Z][A-Z0-9]{1,6}s?)(?![\p{L}])/gu)) {
    const acr = m[1]!.replace(/s$/, "");
    if (COMMON_ACRONYMS.has(acr) || seen.has(acr)) continue;
    seen.add(acr);
    const idx = m.index!;
    const before = text.slice(Math.max(0, idx - 120), idx);
    const after = text.slice(idx + m[0].length, idx + m[0].length + 120);
    const definedBefore = /\(\s*$/.test(before) || new RegExp(`\\(${acr}\\)`).test(text.slice(0, idx + m[0].length + 2));
    const definedAfter = /^\s*\(/.test(after);
    if (definedBefore || definedAfter) continue;
    issues.push(
      makeIssue({
        offset: idx, length: m[0].length, rule: "undefined-acronym", category: "clarity", report: "acronyms",
        title: "Undefined acronym",
        message: `"${acr}" is not spelled out. Write it in full the first time, e.g. "Darwin Innovation Hub (DIH)".`,
      }),
    );
  }
  return {
    id: "acronyms", title: "Acronyms",
    summary: issues.length ? `${issues.length} acronym${issues.length === 1 ? "" : "s"} never spelled out.` : "All acronyms defined.",
    score: score(100 - issues.length * 8), issues, metrics: { undefined: issues.length },
  };
}

/** Flags a mix of citation styles (author-date and numeric). */
export function citations(text: string): ReportResult {
  const authorDate = [...text.matchAll(/\(([A-Z][\p{L}'’-]+(?: (?:et al\.|and|&) [A-Z][\p{L}'’-]+)?),? (\d{4}[a-z]?)(?:, p+\. ?\d+(?:[–-]\d+)?)?\)/gu)];
  const numeric = [...text.matchAll(/\[(\d+(?:[,–-]\s?\d+)*)\]/g)];
  const commaStyle = authorDate.filter((m) => m[0].includes(",")).length;
  const noComma = authorDate.length - commaStyle;
  const issues: Issue[] = [];
  if (authorDate.length && numeric.length) {
    const minority = authorDate.length < numeric.length ? authorDate : numeric;
    for (const m of minority) {
      issues.push(
        makeIssue({
          offset: m.index!, length: m[0].length, rule: "citation-style-mix", category: "consistency",
          report: "citations", severity: "warning", title: "Mixed citation styles",
          message: "This document mixes author-date and numbered citations. Use one style throughout.",
        }),
      );
    }
  }
  if (commaStyle && noComma) {
    const useComma = commaStyle >= noComma;
    for (const m of authorDate) {
      if (m[0].includes(",") === useComma) continue;
      issues.push(
        makeIssue({
          offset: m.index!, length: m[0].length, rule: "citation-format", category: "consistency", report: "citations",
          title: "Citation format",
          message: useComma ? "Other citations put a comma before the year (APA style)." : "Other citations have no comma before the year (Harvard style).",
          replacements: [useComma ? m[0].replace(/ (\d{4})/, ", $1") : m[0].replace(/, (\d{4})/, " $1")],
        }),
      );
    }
  }
  return {
    id: "citations", title: "Citations",
    summary: authorDate.length + numeric.length
      ? `${authorDate.length} author-date and ${numeric.length} numbered citations. ${issues.length} inconsistent.`
      : "No citations found.",
    score: score(100 - issues.length * 10), issues,
    metrics: { authorDate: authorDate.length, numeric: numeric.length, inconsistent: issues.length },
  };
}
