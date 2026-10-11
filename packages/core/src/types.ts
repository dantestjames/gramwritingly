export type Language = "en-AU" | "en-GB" | "en-NZ" | "en-US" | "en-CA" | "en-ZA";

export type IssueCategory =
  | "spelling"
  | "grammar"
  | "punctuation"
  | "style"
  | "readability"
  | "clarity"
  | "consistency"
  | "inclusive"
  | "tone"
  | "styleguide";

export type Severity = "error" | "warning" | "info";

/** Hemingway-style highlight colour key. */
export type HighlightKind =
  | "hard" // yellow
  | "very-hard" // red
  | "simpler" // purple
  | "adverb" // blue
  | "passive" // blue (Hemingway shows passive in green on older builds; we use blue family)
  | "weak"; // blue

export type IssueSource = "core" | "languagetool" | "ai" | "styleguide";

export interface Issue {
  /** Stable for a given text: rule + offset + length. */
  id: string;
  offset: number;
  length: number;
  category: IssueCategory;
  /** Machine id of the rule, e.g. "adverb", "cliche", "LT:MORFOLOGIK_RULE_EN_AU". */
  rule: string;
  /** Report the issue belongs to, if any. */
  report?: ReportId;
  message: string;
  /** Short title shown on cards. */
  title?: string;
  replacements: string[];
  severity: Severity;
  source: IssueSource;
  highlight?: HighlightKind;
}

export interface Span {
  start: number;
  end: number;
  text: string;
}

export type ReportId =
  | "summary"
  | "style"
  | "readability"
  | "sticky"
  | "overused"
  | "repeats"
  | "echoes"
  | "cliches"
  | "redundancies"
  | "sentence-length"
  | "sentence-starts"
  | "pacing"
  | "dialogue"
  | "sensory"
  | "consistency"
  | "passive"
  | "adverbs"
  | "hidden-verbs"
  | "vague"
  | "show-dont-tell"
  | "transitions"
  | "pronouns"
  | "simpler-words"
  | "inclusive"
  | "acronyms"
  | "jargon"
  | "homonyms"
  | "citations"
  | "hemingway";

export interface ReportResult {
  id: ReportId;
  title: string;
  /** One sentence the UI can show under the title. */
  summary: string;
  /** 0 to 100, higher is better. Absent for purely informational reports. */
  score?: number;
  issues: Issue[];
  metrics: Record<string, number | string>;
}

export type DocumentType =
  | "general"
  | "business"
  | "academic"
  | "technical"
  | "fiction"
  | "web"
  | "email"
  | "social";

export interface StyleRule {
  /** Word or phrase to catch. */
  term: string;
  /** What to use instead. Empty means "avoid". */
  replacement?: string;
  note?: string;
  caseSensitive?: boolean;
}

export interface StyleGuide {
  name: string;
  rules: StyleRule[];
  /** Preferred tone keys, e.g. ["confident", "friendly"]. Used for brand tone checks. */
  brandTones?: ToneKey[];
}

export type ToneKey =
  | "confident"
  | "tentative"
  | "friendly"
  | "formal"
  | "casual"
  | "urgent"
  | "positive"
  | "negative";

export interface ToneResult {
  key: ToneKey;
  score: number; // 0..1
}
