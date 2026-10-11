import { DOCUMENT_TYPES, type GoalCheck } from "./goals.js";
import { hemingway } from "./hemingway.js";
import { pct, per1000, score } from "./issue.js";
import { PLANS, reportAllowed, type PlanId } from "./plans.js";
import { readability, stats, type Readability, type TextStats } from "./readability.js";
import { acronyms, citations, consistency, homonyms, inclusive } from "./reports/consistency.js";
import { dialogue, sensory } from "./reports/fiction.js";
import { pacing, pronouns, sentenceLength, sentenceStarts, transitions } from "./reports/structure.js";
import {
  cliches, echoes, hiddenVerbs, jargon, overusedWords, redundancies, repeats, showDontTell, stickySentences, vagueWords,
} from "./reports/style.js";
import { applyStyleGuide, filterDictionary } from "./styleguide.js";
import { detectTone } from "./tone.js";
import { words } from "./tokenise.js";
import type { DocumentType, Issue, Language, ReportId, ReportResult, StyleGuide, ToneResult } from "./types.js";

export interface AnalyseOptions {
  language?: Language;
  documentType?: DocumentType;
  plan?: PlanId;
  styleGuide?: StyleGuide;
  dictionary?: string[];
  /** Reports to compute. Defaults to every report the plan allows. */
  reports?: ReportId[];
}

export interface LockedReport {
  id: ReportId;
  title: string;
  locked: true;
}

export interface AnalysisResult {
  language: Language;
  documentType: DocumentType;
  stats: TextStats;
  readability: Readability;
  tone: ToneResult[];
  /** Issues shown inline as underlines/highlights. */
  issues: Issue[];
  reports: Partial<Record<ReportId, ReportResult | LockedReport>>;
  goals: GoalCheck[];
  /** 0 to 100 overall writing score. */
  score: number;
  /** True when the style reports only looked at the first N words (Free plan). */
  truncated: boolean;
}

export const REPORT_TITLES: Record<ReportId, string> = {
  summary: "Summary", style: "Style", readability: "Readability", sticky: "Sticky sentences",
  overused: "Overused words", repeats: "Repeats", echoes: "Echoes", cliches: "Clichés",
  redundancies: "Redundancies", "sentence-length": "Sentence length", "sentence-starts": "Sentence starts",
  pacing: "Pacing", dialogue: "Dialogue", sensory: "Sensory", consistency: "Consistency",
  passive: "Passive voice", adverbs: "Adverbs", "hidden-verbs": "Hidden verbs", vague: "Vague words",
  "show-dont-tell": "Show, don't tell", transitions: "Transitions", pronouns: "Pronouns",
  "simpler-words": "Simpler words", inclusive: "Inclusive language", acronyms: "Acronyms", jargon: "Corporate jargon",
  homonyms: "Homonyms", citations: "Citations", hemingway: "Readability highlights",
};

/** Reports whose issues appear inline in the editor by default. */
export const INLINE_REPORTS = new Set<ReportId>([
  "hemingway", "simpler-words", "adverbs", "passive", "style", "consistency", "inclusive", "redundancies", "cliches",
]);

function truncateToWords(text: string, limit: number): { text: string; truncated: boolean } {
  if (!Number.isFinite(limit)) return { text, truncated: false };
  const ws = words(text);
  if (ws.length <= limit) return { text, truncated: false };
  return { text: text.slice(0, ws[limit - 1]!.end), truncated: true };
}

export function analyse(fullText: string, opts: AnalyseOptions = {}): AnalysisResult {
  const language = opts.language ?? "en-AU";
  const documentType = opts.documentType ?? "general";
  const plan = opts.plan ?? "free";
  const { text, truncated } = truncateToWords(fullText, PLANS[plan].limits.reportWordLimit);

  const s = stats(fullText);
  const r = readability(fullText, s);
  const hem = hemingway(text);

  const builders: Partial<Record<ReportId, () => ReportResult>> = {
    hemingway: () => ({
      id: "hemingway", title: REPORT_TITLES.hemingway,
      summary: `${hem.summary.hard} of ${hem.summary.sentences} sentences are hard to read, ${hem.summary.veryHard} very hard.`,
      score: score(100 - pct(hem.summary.hard + hem.summary.veryHard * 2, Math.max(1, hem.summary.sentences)) * 1.5),
      issues: hem.issues.filter((i) => i.report === "hemingway"),
      metrics: {
        hard: hem.summary.hard, veryHard: hem.summary.veryHard, sentences: hem.summary.sentences,
        adverbs: hem.summary.adverbs, passive: hem.summary.passive, simpler: hem.summary.simpler,
        qualifiers: hem.summary.qualifiers,
      },
    }),
    readability: () => ({
      id: "readability", title: REPORT_TITLES.readability,
      summary: `Grade ${r.grade} (${r.gradeLabel}). Flesch reading ease ${r.fleschReadingEase}: ${r.easeLabel}.`,
      score: score(100 - Math.max(0, r.grade - DOCUMENT_TYPES[documentType].maxGrade) * 10),
      issues: hem.issues.filter((i) => i.report === "hemingway"),
      metrics: { grade: r.grade, fleschKincaidGrade: r.fleschKincaidGrade, fleschReadingEase: r.fleschReadingEase },
    }),
    adverbs: () => {
      const issues = hem.issues.filter((i) => i.report === "adverbs");
      return {
        id: "adverbs", title: REPORT_TITLES.adverbs,
        summary: `${issues.length} adverb${issues.length === 1 ? "" : "s"}. Aim for ${hem.summary.targets.adverbs} or fewer.`,
        score: score(100 - Math.max(0, issues.length - hem.summary.targets.adverbs) * 5), issues,
        metrics: { adverbs: issues.length, target: hem.summary.targets.adverbs },
      };
    },
    passive: () => {
      const issues = hem.issues.filter((i) => i.report === "passive");
      return {
        id: "passive", title: REPORT_TITLES.passive,
        summary: `${issues.length} passive construction${issues.length === 1 ? "" : "s"}. Aim for ${hem.summary.targets.passive} or fewer.`,
        score: score(100 - Math.max(0, issues.length - hem.summary.targets.passive) * 6), issues,
        metrics: { passive: issues.length, target: hem.summary.targets.passive },
      };
    },
    "simpler-words": () => {
      const issues = hem.issues.filter((i) => i.report === "simpler-words");
      return {
        id: "simpler-words", title: REPORT_TITLES["simpler-words"],
        summary: `${issues.length} word${issues.length === 1 ? "" : "s"} with a plainer alternative.`,
        score: score(100 - issues.length * 4), issues, metrics: { count: issues.length },
      };
    },
    style: () => {
      const qual = hem.issues.filter((i) => i.report === "style");
      return {
        id: "style", title: REPORT_TITLES.style,
        summary: `${qual.length} weak phrase${qual.length === 1 ? "" : "s"}, ${hem.summary.adverbs} adverbs, ${hem.summary.passive} passive.`,
        score: score(100 - per1000(qual.length + hem.summary.adverbs + hem.summary.passive, s.words)),
        issues: qual, metrics: { qualifiers: qual.length, adverbs: hem.summary.adverbs, passive: hem.summary.passive },
      };
    },
    sticky: () => stickySentences(text),
    overused: () => overusedWords(text),
    repeats: () => repeats(text),
    echoes: () => echoes(text),
    cliches: () => cliches(text),
    redundancies: () => redundancies(text),
    "hidden-verbs": () => hiddenVerbs(text),
    vague: () => vagueWords(text),
    jargon: () => jargon(text),
    "show-dont-tell": () => showDontTell(text),
    "sentence-length": () => sentenceLength(text),
    "sentence-starts": () => sentenceStarts(text),
    pronouns: () => pronouns(text),
    transitions: () => transitions(text),
    pacing: () => pacing(text),
    dialogue: () => dialogue(text),
    sensory: () => sensory(text),
    consistency: () => consistency(text, language),
    inclusive: () => inclusive(text),
    homonyms: () => homonyms(text),
    acronyms: () => acronyms(text),
    citations: () => citations(text),
  };

  const wanted = opts.reports ?? (Object.keys(builders) as ReportId[]);
  const reports: AnalysisResult["reports"] = {};
  for (const id of wanted) {
    const build = builders[id];
    if (!build) continue;
    if (!reportAllowed(plan, id)) {
      reports[id] = { id, title: REPORT_TITLES[id], locked: true };
      continue;
    }
    const res = build();
    res.issues = filterDictionary(fullText, res.issues, opts.dictionary);
    reports[id] = res;
  }

  // Inline issues: de-duplicated by id
  const inline = new Map<string, Issue>();
  for (const rep of Object.values(reports)) {
    if (!rep || "locked" in rep) continue;
    if (!INLINE_REPORTS.has(rep.id)) continue;
    for (const i of rep.issues) inline.set(i.id, i);
  }
  // Hemingway highlights always inline when allowed
  if (reportAllowed(plan, "hemingway")) {
    for (const i of hem.issues) inline.set(i.id, i);
  }
  if (opts.styleGuide && PLANS[plan].features.styleGuide) {
    for (const i of applyStyleGuide(fullText, opts.styleGuide)) inline.set(i.id, i);
  }

  const goals = checkGoals(documentType, r.grade, s, hem.summary, reports);
  const scores = Object.values(reports)
    .filter((x): x is ReportResult => !!x && !("locked" in x) && typeof x.score === "number")
    .map((x) => x.score!);
  const overall = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 100;

  return {
    language,
    documentType,
    stats: s,
    readability: r,
    tone: detectTone(fullText),
    issues: [...inline.values()].sort((a, b) => a.offset - b.offset || b.length - a.length),
    reports,
    goals,
    score: score(overall),
    truncated,
  };
}

function checkGoals(
  type: DocumentType,
  grade: number,
  s: TextStats,
  hem: ReturnType<typeof hemingway>["summary"],
  reports: AnalysisResult["reports"],
): GoalCheck[] {
  const g = DOCUMENT_TYPES[type];
  const sticky = reports.sticky;
  const glue = sticky && !("locked" in sticky) ? Number(sticky.metrics.glueIndex) : NaN;
  const checks: GoalCheck[] = [
    { label: "Readability grade", value: grade, target: g.maxGrade, met: grade <= g.maxGrade },
    { label: "Average sentence length", value: s.avgWordsPerSentence, target: g.maxAvgSentence, met: s.avgWordsPerSentence <= g.maxAvgSentence, unit: "words" },
    {
      label: "Adverbs per 1,000 words", value: Math.round(per1000(hem.adverbs, s.words)), target: g.maxAdverbsPer1000,
      met: per1000(hem.adverbs, s.words) <= g.maxAdverbsPer1000,
    },
    {
      label: "Passive sentences", value: pct(hem.passive, Math.max(1, hem.sentences)), target: g.maxPassivePct,
      met: pct(hem.passive, Math.max(1, hem.sentences)) <= g.maxPassivePct, unit: "%",
    },
  ];
  if (!Number.isNaN(glue)) checks.push({ label: "Glue index", value: glue, target: g.maxGlue, met: glue <= g.maxGlue, unit: "%" });
  return checks;
}
