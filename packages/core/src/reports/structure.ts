import { PRONOUNS, TRANSITIONS } from "../data/lexicons.js";
import { findPhrases, makeIssue, pct, score } from "../issue.js";
import { isWord, paragraphs, sentences, words } from "../tokenise.js";
import type { Issue, ReportResult } from "../types.js";

function wc(s: string) {
  return words(s).filter((w) => isWord(w.text)).length;
}

export function sentenceLength(text: string): ReportResult {
  const ss = sentences(text);
  const lengths = ss.map((s) => wc(s.text));
  const n = lengths.length || 1;
  const mean = lengths.reduce((a, b) => a + b, 0) / n;
  const variance = lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  const issues: Issue[] = [];
  ss.forEach((s, i) => {
    const len = lengths[i]!;
    if (len > 35) {
      issues.push(
        makeIssue({
          offset: s.start, length: s.end - s.start, rule: "long-sentence", category: "readability",
          report: "sentence-length", severity: "warning", title: "Very long sentence",
          message: `${len} words. Readers lose the thread past about 30. Split it.`,
        }),
      );
    }
  });
  // Three or more sentences in a row with near-identical length feel monotonous.
  let run = 1;
  for (let i = 1; i < lengths.length; i++) {
    if (Math.abs(lengths[i]! - lengths[i - 1]!) <= 2 && lengths[i]! >= 6) run++;
    else run = 1;
    if (run === 3) {
      const s = ss[i - 2]!;
      const e = ss[i]!;
      issues.push(
        makeIssue({
          offset: s.start, length: e.end - s.start, rule: "monotonous-rhythm", category: "style",
          report: "sentence-length", title: "Flat rhythm",
          message: "Three sentences in a row are about the same length. Vary them so the prose moves.",
        }),
      );
    }
  }
  const variety = mean ? Math.round((sd / mean) * 100) : 0;
  return {
    id: "sentence-length", title: "Sentence length",
    summary: `Average ${mean.toFixed(1)} words. Variety ${variety} (aim for 40+ in most writing).`,
    score: score(100 - Math.max(0, mean - 20) * 3 - Math.max(0, 40 - variety) - issues.length * 3),
    issues,
    metrics: {
      average: Math.round(mean * 10) / 10, standardDeviation: Math.round(sd * 10) / 10, variety,
      longest: Math.max(0, ...lengths), shortest: lengths.length ? Math.min(...lengths) : 0,
      under10: lengths.filter((l) => l < 10).length, from10to19: lengths.filter((l) => l >= 10 && l < 20).length,
      from20to29: lengths.filter((l) => l >= 20 && l < 30).length, over30: lengths.filter((l) => l >= 30).length,
    },
  };
}

export function sentenceStarts(text: string): ReportResult {
  const ss = sentences(text);
  const firsts = ss.map((s) => (words(s.text)[0]?.text ?? "").toLowerCase());
  const issues: Issue[] = [];
  for (let i = 2; i < ss.length; i++) {
    const f = firsts[i];
    if (f && f === firsts[i - 1] && f === firsts[i - 2]) {
      const s = ss[i]!;
      const w = words(s.text)[0]!;
      issues.push(
        makeIssue({
          offset: s.start + w.start, length: w.end - w.start, rule: "repeated-start", category: "style",
          report: "sentence-starts", title: "Repeated opener",
          message: `Three sentences in a row start with "${w.text}". Vary the openings.`,
        }),
      );
    }
  }
  const counts = new Map<string, number>();
  for (const f of firsts) if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];
  return {
    id: "sentence-starts", title: "Sentence starts",
    summary: top ? `Most common opener: "${top[0]}" (${pct(top[1], ss.length)}% of sentences).` : "No sentences yet.",
    score: score(100 - issues.length * 8 - Math.max(0, (top ? pct(top[1], ss.length) : 0) - 20)),
    issues, metrics: { repeatedRuns: issues.length, topOpener: top?.[0] ?? "", topOpenerShare: top ? pct(top[1], ss.length) : 0 },
  };
}

/** Initial pronoun use. Lots of sentences starting with I / He / She reads as a list. */
export function pronouns(text: string): ReportResult {
  const ss = sentences(text);
  let initial = 0;
  for (const s of ss) {
    const first = words(s.text)[0]?.text.toLowerCase();
    if (first && PRONOUNS.has(first)) initial++;
  }
  const share = pct(initial, ss.length);
  const issues: Issue[] = [];
  if (share > 30) {
    for (const s of ss) {
      const w = words(s.text)[0];
      if (w && PRONOUNS.has(w.text.toLowerCase())) {
        issues.push(
          makeIssue({
            offset: s.start + w.start, length: w.end - w.start, rule: "initial-pronoun", category: "style",
            report: "pronouns", title: "Pronoun opener",
            message: `${share}% of your sentences open with a pronoun. Try starting some with action or setting.`,
          }),
        );
      }
    }
  }
  return {
    id: "pronouns", title: "Pronouns",
    summary: `${share}% of sentences start with a pronoun. Aim for under 30%.`,
    score: score(100 - Math.max(0, share - 30) * 2), issues, metrics: { initialPronounShare: share },
  };
}

export function transitions(text: string): ReportResult {
  const ss = sentences(text);
  let withT = 0;
  for (const s of ss) if (findPhrases(s.text, TRANSITIONS).length) withT++;
  const share = pct(withT, ss.length);
  return {
    id: "transitions", title: "Transitions",
    summary: `${share}% of sentences use a transition. Aim for 25% or more in non-fiction so ideas link up.`,
    score: score(60 + Math.min(40, share * 1.6)), issues: [], metrics: { sentencesWithTransitions: withT, share },
  };
}

/**
 * Pacing: flags long paragraphs with no dialogue and long sentences, which tend to read slowly
 * (backstory, introspection, description).
 */
export function pacing(text: string): ReportResult {
  const ps = paragraphs(text);
  const issues: Issue[] = [];
  let slowWords = 0;
  let totalWords = 0;
  for (const p of ps) {
    const n = wc(p.text);
    totalWords += n;
    const ss = sentences(p.text);
    const avg = ss.length ? n / ss.length : n;
    const hasDialogue = /["“”]/.test(p.text);
    const reflective = (p.text.match(/\b(remembered|thought|wondered|realised|realized|had been|used to|years ago|back then)\b/gi) ?? []).length;
    if (!hasDialogue && n >= 120 && (avg >= 22 || reflective >= 2)) {
      slowWords += n;
      issues.push(
        makeIssue({
          offset: p.start, length: p.end - p.start, rule: "slow-paragraph", category: "style", report: "pacing",
          title: "Slow section",
          message: "Long paragraph with long sentences and no dialogue. If this is backstory or introspection, trim it or break it up.",
        }),
      );
    }
  }
  const share = pct(slowWords, totalWords);
  return {
    id: "pacing", title: "Pacing",
    summary: `${share}% of the text is in slower-paced paragraphs.`,
    score: score(100 - Math.max(0, share - 20)), issues, metrics: { slowShare: share, slowParagraphs: issues.length },
  };
}
