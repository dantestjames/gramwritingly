import { GLUE_WORDS } from "./data/lexicons.js";
import { adverbs, passiveVoice } from "./hemingway.js";
import { pct } from "./issue.js";
import { readability, stats } from "./readability.js";
import { dialogue } from "./reports/fiction.js";
import { sentenceLength } from "./reports/structure.js";
import { isWord, words } from "./tokenise.js";

/** Measurable fingerprint of a piece of writing, used for author comparison. */
export interface WritingProfile {
  name: string;
  avgSentenceLength: number;
  sentenceVariety: number;
  grade: number;
  adverbsPer1000: number;
  passivePer100Sentences: number;
  dialogueShare: number;
  glueIndex: number;
  longWordShare: number;
  /** True for built-in indicative presets, false for profiles measured from real text. */
  indicative?: boolean;
}

export function profileText(text: string, name = "Your writing"): WritingProfile {
  const s = stats(text);
  const ws = words(text).filter((w) => isWord(w.text));
  const glue = ws.filter((w) => GLUE_WORDS.has(w.text.toLowerCase())).length;
  const long = ws.filter((w) => w.text.length >= 7).length;
  const sl = sentenceLength(text);
  return {
    name,
    avgSentenceLength: s.avgWordsPerSentence,
    sentenceVariety: Number(sl.metrics.variety ?? 0),
    grade: readability(text, s).grade,
    adverbsPer1000: Math.round((adverbs(text).length / Math.max(1, ws.length)) * 10000) / 10,
    passivePer100Sentences: Math.round((passiveVoice(text).length / Math.max(1, s.sentences)) * 1000) / 10,
    dialogueShare: Number(dialogue(text).metrics.dialogueShare ?? 0),
    glueIndex: pct(glue, ws.length),
    longWordShare: pct(long, ws.length),
  };
}

/**
 * Indicative genre presets. These are rough targets for each style of writing, not
 * measurements of any real author. To compare against a specific author, measure a
 * sample of their text you are licensed to use with profileText().
 */
export const PRESET_PROFILES: WritingProfile[] = [
  { name: "Pacy thriller (indicative)", avgSentenceLength: 12, sentenceVariety: 55, grade: 5, adverbsPer1000: 8, passivePer100Sentences: 4, dialogueShare: 35, glueIndex: 44, longWordShare: 14, indicative: true },
  { name: "Literary fiction (indicative)", avgSentenceLength: 19, sentenceVariety: 65, grade: 8, adverbsPer1000: 10, passivePer100Sentences: 7, dialogueShare: 20, glueIndex: 46, longWordShare: 18, indicative: true },
  { name: "Romance (indicative)", avgSentenceLength: 13, sentenceVariety: 50, grade: 5, adverbsPer1000: 12, passivePer100Sentences: 5, dialogueShare: 40, glueIndex: 47, longWordShare: 13, indicative: true },
  { name: "Plain-English business (indicative)", avgSentenceLength: 16, sentenceVariety: 45, grade: 9, adverbsPer1000: 6, passivePer100Sentences: 8, dialogueShare: 0, glueIndex: 40, longWordShare: 24, indicative: true },
  { name: "Journalism (indicative)", avgSentenceLength: 20, sentenceVariety: 45, grade: 10, adverbsPer1000: 5, passivePer100Sentences: 10, dialogueShare: 8, glueIndex: 42, longWordShare: 22, indicative: true },
];

export interface ProfileDiff {
  metric: keyof Omit<WritingProfile, "name" | "indicative">;
  label: string;
  yours: number;
  theirs: number;
  /** Percentage difference relative to theirs. */
  delta: number;
}

const LABELS: Record<ProfileDiff["metric"], string> = {
  avgSentenceLength: "Average sentence length",
  sentenceVariety: "Sentence variety",
  grade: "Readability grade",
  adverbsPer1000: "Adverbs per 1,000 words",
  passivePer100Sentences: "Passive per 100 sentences",
  dialogueShare: "Dialogue share (%)",
  glueIndex: "Glue index (%)",
  longWordShare: "Long words (%)",
};

export function compareProfiles(yours: WritingProfile, theirs: WritingProfile): ProfileDiff[] {
  return (Object.keys(LABELS) as ProfileDiff["metric"][]).map((metric) => {
    const a = yours[metric];
    const b = theirs[metric];
    return { metric, label: LABELS[metric], yours: a, theirs: b, delta: b === 0 ? 0 : Math.round(((a - b) / b) * 100) };
  });
}
