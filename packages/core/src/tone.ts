import { TONE_WORDS } from "./data/lexicons.js";
import { findPhrases } from "./issue.js";
import { isWord, words } from "./tokenise.js";
import type { ToneKey, ToneResult } from "./types.js";

/** Hits per 100 words that count as a "full" signal for each tone. */
const SATURATION: Record<ToneKey, number> = {
  confident: 3, tentative: 3, friendly: 3, formal: 2.5, casual: 3, urgent: 2, positive: 4, negative: 3,
};

export const TONE_LABELS: Record<ToneKey, { label: string; emoji: string }> = {
  confident: { label: "Confident", emoji: "💪" },
  tentative: { label: "Tentative", emoji: "🤔" },
  friendly: { label: "Friendly", emoji: "🙂" },
  formal: { label: "Formal", emoji: "🎩" },
  casual: { label: "Casual", emoji: "😎" },
  urgent: { label: "Urgent", emoji: "⏰" },
  positive: { label: "Positive", emoji: "☀️" },
  negative: { label: "Negative", emoji: "🌧️" },
};

/**
 * Lexicon-based tone detection. Fast and offline, good enough to show "how you sound".
 * Tone adjustment (rewriting) uses the AI service instead.
 */
export function detectTone(text: string): ToneResult[] {
  const total = words(text).filter((w) => isWord(w.text)).length;
  if (total < 5) return [];
  const scores: ToneResult[] = [];
  for (const key of Object.keys(TONE_WORDS) as ToneKey[]) {
    let hits = findPhrases(text, TONE_WORDS[key]).length;
    if (key === "friendly" || key === "urgent") hits += (text.match(/!/g) ?? []).length * 0.5;
    if (key === "urgent") hits += (text.match(/\b[A-Z]{4,}\b/g) ?? []).length * 0.5;
    if (key === "casual") hits += (text.match(/\b\w+n't\b|\b(?:I'm|you're|we're|it's|that's)\b/gi) ?? []).length * 0.3;
    if (key === "formal") hits -= (text.match(/\b\w+n't\b/gi) ?? []).length * 0.3;
    const rate = (Math.max(0, hits) / total) * 100;
    scores.push({ key, score: Math.round(Math.min(1, rate / SATURATION[key]) * 100) / 100 });
  }
  return scores.filter((s) => s.score >= 0.15).sort((a, b) => b.score - a.score);
}
