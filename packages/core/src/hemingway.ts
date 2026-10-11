import { NOT_ADVERBS, QUALIFIERS, SIMPLER } from "./data/lexicons.js";
import { findPhrases, makeIssue, phraseIssues } from "./issue.js";
import { sentenceGrade } from "./readability.js";
import { matchCase, sentences } from "./tokenise.js";
import type { Issue } from "./types.js";

const IRREGULAR_PARTICIPLES = [
  "known", "given", "taken", "written", "seen", "done", "made", "built", "found", "held", "kept", "left",
  "lost", "paid", "sent", "sold", "spent", "told", "thought", "brought", "bought", "caught", "taught",
  "chosen", "broken", "spoken", "stolen", "driven", "eaten", "fallen", "forgotten", "forgiven", "frozen",
  "hidden", "ridden", "risen", "shaken", "shown", "sworn", "thrown", "woken", "worn", "begun", "drunk",
  "sung", "sunk", "cut", "hit", "hurt", "put", "set", "shut", "spread", "beaten", "bitten", "blown",
  "born", "borne", "drawn", "flown", "grown", "laid", "led", "lent", "meant", "met", "struck",
  "understood", "won", "wound", "torn", "dealt", "felt", "fed", "fought", "heard", "hung", "lit",
  "proven", "bound", "ground", "overtaken", "undertaken", "withdrawn", "rewritten", "mistaken",
];

/** Participles that usually read as adjectives after a "be" verb. */
const ADJECTIVAL = new Set([
  "tired", "interested", "excited", "worried", "bored", "scared", "married", "supposed", "used",
  "concerned", "pleased", "surprised", "shocked", "confused", "embarrassed", "ashamed", "amazed",
  "annoyed", "disappointed", "frightened", "satisfied", "exhausted", "relaxed", "stressed", "thrilled",
  "delighted", "determined", "involved", "located", "based", "related", "qualified", "dedicated",
  "experienced", "talented", "advanced", "detailed", "complicated", "sophisticated", "red", "bed",
  "need", "feed", "seed", "shed", "speed", "bleed", "breed", "proceed", "succeed", "exceed", "indeed",
  "hundred", "sacred", "naked", "wicked", "rugged", "ragged", "crooked", "beloved", "aged",
]);

const BE = "am|is|are|was|were|be|been|being|get|gets|got|gotten|getting|become|became";

const PASSIVE_RE = new RegExp(
  `(?<![\\p{L}])(?:${BE})\\s+(?:(?:not|never|also|just|already|still|often|always|being)\\s+)?(?:\\p{L}+ly\\s+)?(\\p{L}+ed|${IRREGULAR_PARTICIPLES.join("|")})(?![\\p{L}])`,
  "giu",
);

export function hardSentences(text: string): Issue[] {
  const out: Issue[] = [];
  for (const s of sentences(text)) {
    const { grade, words } = sentenceGrade(s);
    if (words < 14) continue;
    if (grade >= 14) {
      out.push(
        makeIssue({
          offset: s.start, length: s.end - s.start, rule: "very-hard-sentence", category: "readability",
          report: "hemingway", highlight: "very-hard", severity: "warning",
          title: "Very hard to read",
          message: `This ${words}-word sentence is dense and complicated. Split it up or cut words that do not earn their place.`,
        }),
      );
    } else if (grade >= 10) {
      out.push(
        makeIssue({
          offset: s.start, length: s.end - s.start, rule: "hard-sentence", category: "readability",
          report: "hemingway", highlight: "hard", severity: "info",
          title: "Hard to read",
          message: `This ${words}-word sentence is long and complex. Shorten it or split it in two.`,
        }),
      );
    }
  }
  return out;
}

export function simplerAlternatives(text: string): Issue[] {
  return phraseIssues(text, SIMPLER, {
    rule: "simpler-word", category: "clarity", report: "simpler-words", highlight: "simpler",
    title: "Simpler alternative",
    message: (hit, rep) => `"${hit.text}" has a simpler alternative: "${rep}".`,
  });
}

export function adverbs(text: string): Issue[] {
  const out: Issue[] = [];
  const re = /(?<![\p{L}])(\p{L}{3,}ly)(?![\p{L}])/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const w = m[1]!;
    if (NOT_ADVERBS.has(w.toLowerCase())) continue;
    // Capitalised mid-sentence words are names ("Beverly", "Gramwritingly"), not adverbs.
    if (/^\p{Lu}/u.test(w) && !/(^|[.!?…]["'”’)]*\s+|\n\s*)$/.test(text.slice(Math.max(0, m.index - 6), m.index))) continue;
    out.push(
      makeIssue({
        offset: m.index, length: w.length, rule: "adverb", category: "style", report: "adverbs",
        highlight: "adverb", title: "Adverb",
        message: `"${w}" is an adverb. A stronger verb often does the job better.`,
        replacements: [""],
      }),
    );
  }
  return out;
}

export function passiveVoice(text: string): Issue[] {
  const out: Issue[] = [];
  PASSIVE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PASSIVE_RE.exec(text))) {
    const participle = m[1]!.toLowerCase();
    if (ADJECTIVAL.has(participle)) continue;
    out.push(
      makeIssue({
        offset: m.index, length: m[0].length, rule: "passive-voice", category: "style", report: "passive",
        highlight: "passive", title: "Passive voice",
        message: `"${m[0]}" is passive. Say who did it for a clearer, more direct sentence.`,
      }),
    );
  }
  return out;
}

export function qualifiers(text: string): Issue[] {
  return findPhrases(text, QUALIFIERS).map((hit) =>
    makeIssue({
      offset: hit.offset, length: hit.length, rule: "qualifier", category: "clarity", report: "style",
      highlight: "weak", title: "Weak phrase",
      message: `"${hit.text}" weakens the sentence. Cut it or be specific.`,
      replacements: [""],
    }),
  );
}

export interface HemingwaySummary {
  hard: number;
  veryHard: number;
  sentences: number;
  adverbs: number;
  passive: number;
  simpler: number;
  qualifiers: number;
  /** Hemingway's rule of thumb targets for this text length. */
  targets: { adverbs: number; passive: number };
}

export function hemingway(text: string): { issues: Issue[]; summary: HemingwaySummary } {
  const hard = hardSentences(text);
  const adv = adverbs(text);
  const pas = passiveVoice(text);
  const simp = simplerAlternatives(text);
  const qual = qualifiers(text);
  const sentenceCount = sentences(text).length;
  return {
    issues: [...hard, ...simp, ...adv, ...pas, ...qual],
    summary: {
      hard: hard.filter((i) => i.highlight === "hard").length,
      veryHard: hard.filter((i) => i.highlight === "very-hard").length,
      sentences: sentenceCount,
      adverbs: adv.length,
      passive: pas.length,
      simpler: simp.length,
      qualifiers: qual.length,
      targets: {
        adverbs: Math.max(1, Math.round(sentenceCount / 10)),
        passive: Math.max(1, Math.round(sentenceCount / 5)),
      },
    },
  };
}

export { matchCase };
