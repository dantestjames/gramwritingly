import type { ReportId } from "./types.js";

export type PlanId = "free" | "pro";

export type FeatureKey =
  | "spellingGrammar"
  | "readabilityHighlights"
  | "toneDetection"
  | "thesaurus"
  | "storyCanvas"
  | "customDictionary"
  | "aiRewrite"
  | "aiToneAdjust"
  | "aiFluency"
  | "aiCustomRequest"
  | "aiSynonyms"
  | "aiSparks"
  | "documentFeedback"
  | "chapterCritique"
  | "aiDetection"
  | "plagiarism"
  | "allReports"
  | "unlimitedReportLength"
  | "inclusiveLanguage"
  | "citations"
  | "styleGuide"
  | "brandTone"
  | "snippets"
  | "authorComparison"
  | "importExport"
  | "targetReadingLevel"
  | "comments";

export interface PlanLimits {
  /** AI sentence credits per month. One credit = one sentence rewritten. */
  aiCreditsPerMonth: number;
  chapterCritiquesPerDay: number;
  sparksPerDay: number;
  plagiarismScansPerMonth: number;
  /** Max words analysed by the style reports per check. Spelling and grammar have no cap. */
  reportWordLimit: number;
  documents: number;
  styleGuideRules: number;
  snippets: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  /** Display prices in AUD. Billing is not wired up in phase 1. */
  priceMonthlyAud: number;
  priceYearlyAud: number;
  features: Record<FeatureKey, boolean>;
  limits: PlanLimits;
  reports: ReportId[] | "all";
}

const FREE_REPORTS: ReportId[] = [
  "summary", "readability", "hemingway", "sentence-length", "consistency", "cliches", "redundancies", "sticky",
];

const NONE = Object.fromEntries(
  ([
    "spellingGrammar", "readabilityHighlights", "toneDetection", "thesaurus", "storyCanvas", "customDictionary",
    "aiRewrite", "aiToneAdjust", "aiFluency", "aiCustomRequest", "aiSynonyms", "aiSparks", "documentFeedback",
    "chapterCritique", "aiDetection", "plagiarism", "allReports", "unlimitedReportLength", "inclusiveLanguage",
    "citations", "styleGuide", "brandTone", "snippets", "authorComparison", "importExport", "targetReadingLevel",
    "comments",
  ] as FeatureKey[]).map((k) => [k, false]),
) as Record<FeatureKey, boolean>;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthlyAud: 0,
    priceYearlyAud: 0,
    features: {
      ...NONE,
      spellingGrammar: true,
      readabilityHighlights: true,
      toneDetection: true,
      thesaurus: true,
      storyCanvas: true,
      customDictionary: true,
      aiRewrite: true, // limited by credits
      aiSparks: true, // limited per day
    },
    limits: {
      aiCreditsPerMonth: 100,
      chapterCritiquesPerDay: 0,
      sparksPerDay: 3,
      plagiarismScansPerMonth: 0,
      reportWordLimit: 1000,
      documents: 20,
      styleGuideRules: 0,
      snippets: 0,
    },
    reports: FREE_REPORTS,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthlyAud: 19,
    priceYearlyAud: 144,
    features: Object.fromEntries(Object.keys(NONE).map((k) => [k, true])) as Record<FeatureKey, boolean>,
    limits: {
      aiCreditsPerMonth: 5000,
      chapterCritiquesPerDay: 30,
      sparksPerDay: 50,
      plagiarismScansPerMonth: 20,
      reportWordLimit: Number.POSITIVE_INFINITY,
      documents: Number.POSITIVE_INFINITY,
      styleGuideRules: 500,
      snippets: 200,
    },
    reports: "all",
  },
};

export function hasFeature(plan: PlanId, feature: FeatureKey): boolean {
  return PLANS[plan].features[feature];
}

export function reportAllowed(plan: PlanId, report: ReportId): boolean {
  const r = PLANS[plan].reports;
  return r === "all" || r.includes(report);
}
