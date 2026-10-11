import {
  CLICHES, EMOTIONS, GLUE_WORDS, HIDDEN_VERBS, JARGON, OVERUSED, REDUNDANCIES, TELL_VERBS, VAGUE_WORDS,
} from "../data/lexicons.js";
import { findPhrases, makeIssue, pct, per1000, phraseIssues, score } from "../issue.js";
import { isWord, sentences, words } from "../tokenise.js";
import type { Issue, ReportResult } from "../types.js";

/** Sentences where glue words make up 45% or more. */
export function stickySentences(text: string): ReportResult {
  const ss = sentences(text);
  const issues: Issue[] = [];
  let glueTotal = 0;
  let wordTotal = 0;
  for (const s of ss) {
    const ws = words(s.text).filter((w) => isWord(w.text));
    if (ws.length === 0) continue;
    const glue = ws.filter((w) => GLUE_WORDS.has(w.text.toLowerCase().replace(/’/g, "'"))).length;
    glueTotal += glue;
    wordTotal += ws.length;
    const share = glue / ws.length;
    if (ws.length >= 8 && share >= 0.45) {
      issues.push(
        makeIssue({
          offset: s.start, length: s.end - s.start, rule: "sticky-sentence", category: "clarity", report: "sticky",
          severity: share >= 0.55 ? "warning" : "info", title: "Sticky sentence",
          message: `${Math.round(share * 100)}% of this sentence is glue words (the, of, it, to…). Rework it so the meaning words carry it.`,
        }),
      );
    }
  }
  const gi = pct(glueTotal, wordTotal);
  return {
    id: "sticky", title: "Sticky sentences",
    summary: `Glue index ${gi}%. Aim for under 40%. ${issues.length} sticky sentence${issues.length === 1 ? "" : "s"}.`,
    score: score(100 - Math.max(0, gi - 35) * 4 - issues.length * 3),
    issues, metrics: { glueIndex: gi, stickySentences: issues.length },
  };
}

export function overusedWords(text: string): ReportResult {
  const ws = words(text).filter((w) => isWord(w.text));
  const total = ws.length;
  const counts = new Map<string, number>();
  for (const w of ws) {
    const k = w.text.toLowerCase();
    if (k in OVERUSED) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const over = new Set<string>();
  const metrics: Record<string, number> = {};
  for (const [k, c] of counts) {
    const limit = OVERUSED[k]!;
    const allowed = Math.max(1, Math.floor((limit * total) / 1000));
    metrics[k] = c;
    if (c > allowed) over.add(k);
  }
  const issues = ws
    .filter((w) => over.has(w.text.toLowerCase()))
    .map((w) =>
      makeIssue({
        offset: w.start, length: w.end - w.start, rule: "overused-word", category: "style", report: "overused",
        title: "Overused word",
        message: `"${w.text}" appears ${counts.get(w.text.toLowerCase())} times. Cut some or vary them.`,
      }),
    );
  return {
    id: "overused", title: "Overused words",
    summary: over.size ? `You lean on ${[...over].slice(0, 5).map((w) => `"${w}"`).join(", ")}.` : "No overused words.",
    score: score(100 - over.size * 8),
    issues, metrics,
  };
}

/** Repeated 3 and 4 word phrases anywhere in the text. Linear time: each word is claimed once. */
export function repeats(text: string): ReportResult {
  const ws = words(text).filter((w) => isWord(w.text));
  const lower = ws.map((w) => w.text.toLowerCase());
  const issues: Issue[] = [];
  const claimed = new Uint8Array(ws.length);
  let phraseCount = 0;
  for (const n of [4, 3]) {
    const seen = new Map<string, number[]>();
    for (let i = 0; i + n <= ws.length; i++) {
      let content = 0;
      for (let k = i; k < i + n; k++) if (!GLUE_WORDS.has(lower[k]!)) content++;
      if (content < 2) continue;
      // Skip phrases that cross a sentence end.
      if (/[.!?]\s/.test(text.slice(ws[i]!.start, ws[i + n - 1]!.end))) continue;
      const key = lower.slice(i, i + n).join(" ");
      const list = seen.get(key);
      if (list) {
        if (list.length < 50) list.push(i);
      } else seen.set(key, [i]);
    }
    for (const [key, starts] of seen) {
      if (starts.length < 2) continue;
      // Drop occurrences already covered by a longer repeated phrase.
      const fresh = starts.filter((i) => {
        for (let k = i; k < i + n; k++) if (!claimed[k]) return true;
        return false;
      });
      if (fresh.length < 2) continue;
      phraseCount++;
      for (const i of fresh) {
        claimed.fill(1, i, i + n);
        const s = ws[i]!.start;
        issues.push(
          makeIssue({
            offset: s, length: ws[i + n - 1]!.end - s, rule: "repeated-phrase", category: "style", report: "repeats",
            title: "Repeated phrase",
            message: `"${key}" appears ${starts.length} times. Rephrase one.`,
          }),
        );
      }
    }
  }
  issues.sort((a, b) => a.offset - b.offset);
  return {
    id: "repeats", title: "Repeats",
    summary: phraseCount ? `${phraseCount} repeated phrase${phraseCount === 1 ? "" : "s"}.` : "No repeated phrases.",
    score: score(100 - phraseCount * 6),
    issues, metrics: { repeatedPhrases: phraseCount },
  };
}

/** The same meaning word used again within a short distance. */
export function echoes(text: string, window = 30): ReportResult {
  const ws = words(text).filter((w) => isWord(w.text));
  const last = new Map<string, number>();
  const issues: Issue[] = [];
  ws.forEach((w, idx) => {
    const k = w.text.toLowerCase();
    if (k.length < 4 || GLUE_WORDS.has(k)) return;
    const prev = last.get(k);
    if (prev !== undefined && idx - prev <= window) {
      issues.push(
        makeIssue({
          offset: w.start, length: w.end - w.start, rule: "echo", category: "style", report: "echoes",
          title: "Echo", message: `"${w.text}" was used ${idx - prev} words ago. Try a different word.`,
        }),
      );
    }
    last.set(k, idx);
  });
  return {
    id: "echoes", title: "Echoes",
    summary: `${issues.length} word${issues.length === 1 ? "" : "s"} repeated close together.`,
    score: score(100 - per1000(issues.length, ws.length) * 2),
    issues, metrics: { echoes: issues.length },
  };
}

export function cliches(text: string): ReportResult {
  const issues = findPhrases(text, CLICHES).map((h) =>
    makeIssue({
      offset: h.offset, length: h.length, rule: "cliche", category: "style", report: "cliches", severity: "warning",
      title: "Cliché", message: `"${h.text}" is a cliché. Say it in a fresh way.`,
    }),
  );
  return {
    id: "cliches", title: "Clichés",
    summary: issues.length ? `${issues.length} cliché${issues.length === 1 ? "" : "s"} found.` : "No clichés.",
    score: score(100 - issues.length * 10), issues, metrics: { cliches: issues.length },
  };
}

export function redundancies(text: string): ReportResult {
  const issues = phraseIssues(text, REDUNDANCIES, {
    rule: "redundancy", category: "clarity", report: "redundancies", severity: "warning", title: "Redundancy",
    message: (h, r) => `"${h.text}" says the same thing twice. "${r}" is enough.`,
  });
  return {
    id: "redundancies", title: "Redundancies",
    summary: issues.length ? `${issues.length} redundant phrase${issues.length === 1 ? "" : "s"}.` : "No redundancies.",
    score: score(100 - issues.length * 8), issues, metrics: { redundancies: issues.length },
  };
}

export function hiddenVerbs(text: string): ReportResult {
  const issues = phraseIssues(text, HIDDEN_VERBS, {
    rule: "hidden-verb", category: "clarity", report: "hidden-verbs", title: "Hidden verb",
    message: (h, r) => `"${h.text}" hides the verb. Try "${r}".`,
  });
  return {
    id: "hidden-verbs", title: "Hidden verbs",
    summary: `${issues.length} hidden verb${issues.length === 1 ? "" : "s"}.`,
    score: score(100 - issues.length * 6), issues, metrics: { hiddenVerbs: issues.length },
  };
}

export function vagueWords(text: string): ReportResult {
  const total = words(text).length;
  const issues = findPhrases(text, VAGUE_WORDS).map((h) =>
    makeIssue({
      offset: h.offset, length: h.length, rule: "vague-word", category: "clarity", report: "vague",
      title: "Vague word", message: `"${h.text}" is vague. Name the specific thing or quality.`,
    }),
  );
  return {
    id: "vague", title: "Vague and abstract words",
    summary: `${issues.length} vague word${issues.length === 1 ? "" : "s"}.`,
    score: score(100 - per1000(issues.length, total) * 2), issues, metrics: { vague: issues.length },
  };
}

export function jargon(text: string): ReportResult {
  const issues = findPhrases(text, JARGON).map((h) =>
    makeIssue({
      offset: h.offset, length: h.length, rule: "jargon", category: "clarity", report: "jargon",
      title: "Corporate jargon", message: `"${h.text}" is corporate jargon. Use plain words.`,
    }),
  );
  return {
    id: "jargon", title: "Corporate jargon",
    summary: issues.length ? `${issues.length} jargon term${issues.length === 1 ? "" : "s"}.` : "No jargon.",
    score: score(100 - issues.length * 8), issues, metrics: { jargon: issues.length },
  };
}

/** "She felt angry" style emotion telling. */
export function showDontTell(text: string): ReportResult {
  const re = new RegExp(
    `(?<![\\p{L}])(?:${TELL_VERBS.join("|")})\\s+(?:(?:very|so|really|quite|a\\s+bit|a\\s+little|extremely|incredibly)\\s+)?(?:${EMOTIONS.join("|")})(?![\\p{L}])`,
    "giu",
  );
  const issues: Issue[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    issues.push(
      makeIssue({
        offset: m.index, length: m[0].length, rule: "show-dont-tell", category: "style", report: "show-dont-tell",
        title: "Telling, not showing",
        message: `"${m[0]}" tells the reader the emotion. Show it through action, body language or dialogue.`,
      }),
    );
  }
  return {
    id: "show-dont-tell", title: "Show, don't tell",
    summary: `${issues.length} place${issues.length === 1 ? "" : "s"} where an emotion is stated outright.`,
    score: score(100 - issues.length * 7), issues, metrics: { tells: issues.length },
  };
}
