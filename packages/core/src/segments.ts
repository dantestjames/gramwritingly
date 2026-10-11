import type { HighlightKind, Issue } from "./types.js";

export interface Segment {
  start: number;
  end: number;
  /** Sentence-level readability highlight (yellow / red). */
  sentence?: HighlightKind;
  /** Word-level Hemingway background (purple / blue). */
  word?: HighlightKind;
  /** Underlined issues covering this segment, most important first. */
  underline: Issue[];
}

const SENTENCE_KINDS = new Set<HighlightKind>(["hard", "very-hard"]);
const HEMINGWAY_WORD = new Set<HighlightKind>(["simpler", "adverb", "passive", "weak"]);

export interface SegmentOptions {
  /** Show Hemingway colour highlights. */
  readability: boolean;
  /** Show underlines for corrections and suggestions. */
  corrections: boolean;
}

/**
 * Splits text into runs that share the same set of highlights, ready to render as
 * <span>s behind a textarea or inside an overlay.
 */
export function buildSegments(text: string, issues: Issue[], opts: SegmentOptions): Segment[] {
  const points = new Set<number>([0, text.length]);
  const active = issues.filter((i) => {
    if (i.offset < 0 || i.offset + i.length > text.length || i.length <= 0) return false;
    if (i.highlight && (SENTENCE_KINDS.has(i.highlight) || HEMINGWAY_WORD.has(i.highlight))) return opts.readability;
    return opts.corrections;
  });
  for (const i of active) {
    points.add(i.offset);
    points.add(i.offset + i.length);
  }
  const sorted = [...points].sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let k = 0; k < sorted.length - 1; k++) {
    const start = sorted[k]!;
    const end = sorted[k + 1]!;
    if (end <= start) continue;
    const covering = active.filter((i) => i.offset <= start && i.offset + i.length >= end);
    const seg: Segment = { start, end, underline: [] };
    for (const i of covering) {
      if (i.highlight && SENTENCE_KINDS.has(i.highlight)) {
        if (seg.sentence !== "very-hard") seg.sentence = i.highlight;
      } else if (i.highlight && HEMINGWAY_WORD.has(i.highlight)) {
        seg.word ??= i.highlight;
      } else {
        seg.underline.push(i);
      }
    }
    seg.underline.sort((a, b) => sevRank(a) - sevRank(b) || a.length - b.length);
    out.push(seg);
  }
  return out;
}

function sevRank(i: Issue) {
  return i.severity === "error" ? 0 : i.severity === "warning" ? 1 : 2;
}

/** Issues whose range contains the given caret position, smallest first. */
export function issuesAt(issues: Issue[], pos: number): Issue[] {
  return issues
    .filter((i) => pos >= i.offset && pos <= i.offset + i.length)
    .sort((a, b) => a.length - b.length);
}

/** CSS colour key for an underline. */
export function underlineColour(i: Issue): "red" | "blue" | "amber" | "purple" | "green" {
  switch (i.category) {
    case "spelling":
    case "grammar":
    case "punctuation":
      return "red";
    case "clarity":
    case "readability":
      return "blue";
    case "consistency":
    case "styleguide":
      return "purple";
    case "inclusive":
    case "tone":
      return "green";
    default:
      return "amber";
  }
}

/** Finds the changed region between two versions of a text (for shifting stale issues). */
export function diffRegion(prev: string, next: string): { start: number; prevEnd: number; nextEnd: number } {
  let start = 0;
  const min = Math.min(prev.length, next.length);
  while (start < min && prev[start] === next[start]) start++;
  let pe = prev.length;
  let ne = next.length;
  while (pe > start && ne > start && prev[pe - 1] === next[ne - 1]) {
    pe--;
    ne--;
  }
  return { start, prevEnd: pe, nextEnd: ne };
}
