import { isWord, paragraphs, sentences, syllables, words } from "./tokenise.js";
import type { Span } from "./types.js";

export interface TextStats {
  characters: number;
  charactersNoSpaces: number;
  letters: number;
  words: number;
  sentences: number;
  paragraphs: number;
  syllables: number;
  /** Minutes at 238 words per minute (average adult silent reading). */
  readingTimeMinutes: number;
  /** Minutes at 150 words per minute. */
  speakingTimeMinutes: number;
  avgWordsPerSentence: number;
  avgLettersPerWord: number;
  avgSyllablesPerWord: number;
}

export interface Readability {
  /** US school grade, Automated Readability Index (what Hemingway displays). */
  grade: number;
  gradeLabel: string;
  fleschKincaidGrade: number;
  /** 0 (very hard) to 100 (very easy). */
  fleschReadingEase: number;
  /** Plain-English band of the reading ease score. */
  easeLabel: string;
}

function lettersIn(s: string) {
  return (s.match(/\p{L}|\p{N}/gu) ?? []).length;
}

export function stats(text: string): TextStats {
  const ws = words(text).filter((w) => isWord(w.text) || /\d/.test(w.text));
  const ss = sentences(text);
  const ps = paragraphs(text);
  const letters = ws.reduce((n, w) => n + lettersIn(w.text), 0);
  const syl = ws.reduce((n, w) => n + syllables(w.text), 0);
  const wc = ws.length;
  return {
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/g, "").length,
    letters,
    words: wc,
    sentences: ss.length,
    paragraphs: ps.length,
    syllables: syl,
    readingTimeMinutes: round1(wc / 238),
    speakingTimeMinutes: round1(wc / 150),
    avgWordsPerSentence: ss.length ? round1(wc / ss.length) : 0,
    avgLettersPerWord: wc ? round1(letters / wc) : 0,
    avgSyllablesPerWord: wc ? round1(syl / wc) : 0,
  };
}

export function ari(letters: number, wordCount: number, sentenceCount: number): number {
  if (wordCount === 0 || sentenceCount === 0) return 0;
  return 4.71 * (letters / wordCount) + 0.5 * (wordCount / sentenceCount) - 21.43;
}

export function readability(text: string, s: TextStats = stats(text)): Readability {
  const grade = Math.max(0, Math.round(ari(s.letters, s.words, s.sentences)));
  const fk =
    s.words && s.sentences
      ? 0.39 * (s.words / s.sentences) + 11.8 * (s.syllables / s.words) - 15.59
      : 0;
  const fre =
    s.words && s.sentences
      ? 206.835 - 1.015 * (s.words / s.sentences) - 84.6 * (s.syllables / s.words)
      : 100;
  return {
    grade,
    gradeLabel: gradeLabel(grade),
    fleschKincaidGrade: round1(Math.max(0, fk)),
    fleschReadingEase: round1(Math.max(0, Math.min(100, fre))),
    easeLabel: easeLabel(fre),
  };
}

export function gradeLabel(grade: number): string {
  if (grade <= 6) return "Very easy";
  if (grade <= 9) return "Good";
  if (grade <= 12) return "OK";
  if (grade <= 15) return "Hard";
  return "Very hard";
}

function easeLabel(fre: number): string {
  if (fre >= 80) return "Very easy to read";
  if (fre >= 60) return "Plain English";
  if (fre >= 50) return "Fairly difficult";
  if (fre >= 30) return "Difficult";
  return "Very difficult";
}

/** Grade for a single sentence (used for yellow/red highlights). */
export function sentenceGrade(sentence: Span): { grade: number; words: number } {
  const ws = words(sentence.text).filter((w) => isWord(w.text) || /\d/.test(w.text));
  const letters = ws.reduce((n, w) => n + lettersIn(w.text), 0);
  return { grade: ari(letters, ws.length, 1), words: ws.length };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
