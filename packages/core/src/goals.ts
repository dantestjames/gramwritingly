import type { DocumentType } from "./types.js";

export interface DocumentGoals {
  label: string;
  /** Highest acceptable readability grade. */
  maxGrade: number;
  /** Highest acceptable average sentence length. */
  maxAvgSentence: number;
  /** Max adverbs per 1,000 words. */
  maxAdverbsPer1000: number;
  /** Max passive sentences as a share of all sentences (%). */
  maxPassivePct: number;
  /** Max glue index (%). */
  maxGlue: number;
  /** Reports switched on by default for this type. */
  reports: string[];
}

export const DOCUMENT_TYPES: Record<DocumentType, DocumentGoals> = {
  general: {
    label: "General", maxGrade: 9, maxAvgSentence: 20, maxAdverbsPer1000: 15, maxPassivePct: 15, maxGlue: 40,
    reports: ["readability", "sticky", "overused", "repeats", "cliches", "redundancies", "consistency", "sentence-length"],
  },
  business: {
    label: "Business", maxGrade: 10, maxAvgSentence: 20, maxAdverbsPer1000: 10, maxPassivePct: 10, maxGlue: 40,
    reports: ["readability", "sticky", "hidden-verbs", "jargon", "redundancies", "acronyms", "consistency", "inclusive"],
  },
  academic: {
    label: "Academic", maxGrade: 14, maxAvgSentence: 26, maxAdverbsPer1000: 12, maxPassivePct: 25, maxGlue: 42,
    reports: ["readability", "sticky", "citations", "acronyms", "consistency", "transitions", "hidden-verbs", "vague"],
  },
  technical: {
    label: "Technical", maxGrade: 12, maxAvgSentence: 22, maxAdverbsPer1000: 8, maxPassivePct: 20, maxGlue: 38,
    reports: ["readability", "acronyms", "consistency", "vague", "sentence-length", "hidden-verbs"],
  },
  fiction: {
    label: "Fiction", maxGrade: 8, maxAvgSentence: 16, maxAdverbsPer1000: 12, maxPassivePct: 10, maxGlue: 45,
    reports: ["dialogue", "pacing", "sensory", "show-dont-tell", "overused", "echoes", "repeats", "cliches", "sentence-starts", "sentence-length"],
  },
  web: {
    label: "Web and marketing", maxGrade: 8, maxAvgSentence: 16, maxAdverbsPer1000: 10, maxPassivePct: 8, maxGlue: 38,
    reports: ["readability", "simpler-words", "jargon", "cliches", "sticky", "inclusive"],
  },
  email: {
    label: "Email", maxGrade: 9, maxAvgSentence: 18, maxAdverbsPer1000: 12, maxPassivePct: 10, maxGlue: 42,
    reports: ["readability", "sticky", "redundancies", "jargon", "inclusive"],
  },
  social: {
    label: "Social post", maxGrade: 7, maxAvgSentence: 14, maxAdverbsPer1000: 10, maxPassivePct: 5, maxGlue: 40,
    reports: ["readability", "cliches", "simpler-words", "inclusive"],
  },
};

export interface GoalCheck {
  label: string;
  value: number;
  target: number;
  met: boolean;
  unit?: string;
}
