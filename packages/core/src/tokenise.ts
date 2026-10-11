import type { Span } from "./types.js";

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "st", "sr", "jr", "vs", "etc", "eg", "ie",
  "e.g", "i.e", "inc", "ltd", "pty", "co", "corp", "no", "vol", "fig", "approx",
  "dept", "est", "mt", "rd", "ave", "jan", "feb", "mar", "apr", "jun", "jul",
  "aug", "sep", "sept", "oct", "nov", "dec", "a.m", "p.m", "u.s", "u.k", "cf", "al",
]);

/** Paragraphs are runs of text separated by one or more line breaks. */
export function paragraphs(text: string): Span[] {
  const out: Span[] = [];
  const re = /[^\n]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[0].trim().length === 0) continue;
    const lead = m[0].length - m[0].trimStart().length;
    const trimmed = m[0].trim();
    out.push({ start: m.index + lead, end: m.index + lead + trimmed.length, text: trimmed });
  }
  return out;
}

function isAbbreviation(text: string, dotIndex: number): boolean {
  let i = dotIndex - 1;
  while (i >= 0 && /[A-Za-z.]/.test(text[i]!)) i--;
  const word = text.slice(i + 1, dotIndex).toLowerCase();
  if (word.length === 0) return false;
  if (ABBREVIATIONS.has(word)) return true;
  // Single capital initial, e.g. "J. Smith"
  if (word.length === 1 && /[A-Z]/.test(text[dotIndex - 1]!)) return true;
  return false;
}

/** Splits text into sentences with absolute offsets. Never crosses a paragraph break. */
export function sentences(text: string): Span[] {
  const out: Span[] = [];
  for (const para of paragraphs(text)) {
    const p = para.text;
    let start = 0;
    for (let i = 0; i < p.length; i++) {
      const ch = p[i]!;
      if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "…") continue;
      // Swallow runs like "?!" or "..." and closing quotes/brackets.
      let end = i + 1;
      while (end < p.length && /[.!?…]/.test(p[end]!)) end++;
      while (end < p.length && /["'”’)\]]/.test(p[end]!)) end++;
      const next = p[end];
      const atEnd = end >= p.length;
      if (!atEnd && next !== " " && next !== "\t") {
        i = end - 1;
        continue;
      }
      if (ch === "." && isAbbreviation(p, i)) continue;
      // Decimal numbers like 3.5 are handled by the "next must be space" rule.
      // Lower-case continuation after "..." is usually the same sentence.
      if (!atEnd) {
        let k = end;
        while (k < p.length && /\s/.test(p[k]!)) k++;
        const after = p[k];
        if (after && /[a-z]/.test(after) && (ch === "…" || p.slice(i, i + 3) === "...")) continue;
      }
      pushSentence(out, p, start, end, para.start);
      start = end;
      i = end - 1;
    }
    if (start < p.length) pushSentence(out, p, start, p.length, para.start);
  }
  return out;
}

function pushSentence(out: Span[], p: string, s: number, e: number, base: number) {
  const raw = p.slice(s, e);
  const lead = raw.length - raw.trimStart().length;
  const t = raw.trim();
  if (!t) return;
  out.push({ start: base + s + lead, end: base + s + lead + t.length, text: t });
}

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

/** Words with absolute offsets. Trailing apostrophes and hyphens are trimmed. */
export function words(text: string, base = 0): Span[] {
  const out: Span[] = [];
  WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_RE.exec(text))) {
    let w = m[0];
    while (w.length > 1 && /['’-]$/.test(w)) w = w.slice(0, -1);
    out.push({ start: base + m.index, end: base + m.index + w.length, text: w });
  }
  return out;
}

/** True when a token is a real word (has a letter), as opposed to a number. */
export function isWord(token: string): boolean {
  return /\p{L}/u.test(token);
}

/** Heuristic English syllable counter. Accurate enough for readability scores. */
export function syllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  w = w.replace(/^y/, "");
  const groups = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Keeps the capitalisation of the original when suggesting a replacement. */
export function matchCase(original: string, replacement: string): string {
  if (!replacement) return replacement;
  if (original.length > 1 && original === original.toUpperCase() && /[A-Z]/.test(original)) {
    return replacement.toUpperCase();
  }
  if (/^[A-Z]/.test(original)) return replacement[0]!.toUpperCase() + replacement.slice(1);
  return replacement;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Builds one case-insensitive regex matching any of the phrases on word boundaries. */
export function phraseRegex(phrases: string[], flags = "gi"): RegExp {
  const sorted = [...phrases].sort((a, b) => b.length - a.length).map((p) =>
    escapeRegExp(p).replace(/\\?'/g, "['’]").replace(/ /g, "\\s+"),
  );
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${sorted.join("|")})(?![\\p{L}\\p{N}])`, flags.includes("u") ? flags : flags + "u");
}

export function normalise(s: string): string {
  return s.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
}
