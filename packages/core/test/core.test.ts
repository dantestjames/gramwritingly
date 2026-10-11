import { describe, expect, it } from "vitest";
import {
  analyse, applyFix, applyStyleGuide, citations, compareProfiles, consistency, detectTone, dialectSpelling, dialogue,
  hemingway, inclusive, mergeIssues, paragraphs, PRESET_PROFILES, profileText, readability, repeats, sentences,
  showDontTell, stickySentences, syllables, words,
} from "../src/index.js";

describe("tokenise", () => {
  it("splits sentences without breaking on abbreviations or decimals", () => {
    const t = "Dr. Smith paid $3.50 for coffee. It was good! Was it? Yes.";
    expect(sentences(t).map((s) => s.text)).toEqual([
      "Dr. Smith paid $3.50 for coffee.", "It was good!", "Was it?", "Yes.",
    ]);
  });

  it("keeps absolute offsets across paragraphs", () => {
    const t = "First one.\n\nSecond para here.";
    const ss = sentences(t);
    expect(t.slice(ss[1]!.start, ss[1]!.end)).toBe("Second para here.");
    expect(paragraphs(t)).toHaveLength(2);
  });

  it("finds words with apostrophes and hyphens", () => {
    expect(words("It's a well-known fact, isn’t it?").map((w) => w.text)).toEqual([
      "It's", "a", "well-known", "fact", "isn’t", "it",
    ]);
  });

  it("counts syllables reasonably", () => {
    expect(syllables("cat")).toBe(1);
    expect(syllables("water")).toBe(2);
    expect(syllables("readability")).toBeGreaterThanOrEqual(4);
  });
});

describe("readability", () => {
  it("gives simple text a low grade", () => {
    const r = readability("The cat sat on the mat. The dog ran to the park. We had fun.");
    expect(r.grade).toBeLessThanOrEqual(3);
    expect(r.gradeLabel).toBe("Very easy");
  });

  it("gives dense text a high grade", () => {
    const r = readability(
      "Notwithstanding considerable organisational restructuring, the implementation of comprehensive interdepartmental communication methodologies necessitated substantial reconfiguration of established administrative procedures.",
    );
    expect(r.grade).toBeGreaterThanOrEqual(15);
  });
});

describe("hemingway highlights", () => {
  const text =
    "The report was written by the team. She quickly utilised the approximately complete draft. " +
    "Notwithstanding considerable organisational restructuring, the implementation of comprehensive communication methodologies necessitated substantial reconfiguration of established procedures.";
  const { issues, summary } = hemingway(text);

  it("flags passive voice", () => {
    expect(issues.some((i) => i.rule === "passive-voice" && text.slice(i.offset, i.offset + i.length) === "was written")).toBe(true);
  });
  it("flags adverbs but not 'only' or 'family'", () => {
    expect(issues.some((i) => i.rule === "adverb" && text.slice(i.offset, i.offset + i.length) === "quickly")).toBe(true);
    expect(hemingway("Only my family came.").issues.some((i) => i.rule === "adverb")).toBe(false);
  });
  it("suggests simpler words with matching case", () => {
    const hit = issues.find((i) => i.rule === "simpler-word" && i.replacements[0] === "used");
    expect(hit).toBeDefined();
    expect(hemingway("Approximately ten came.").issues[0]?.replacements[0]).toBe("About");
  });
  it("marks a very hard sentence", () => {
    expect(summary.veryHard).toBe(1);
  });
  it("does not treat adjectival participles as passive", () => {
    expect(hemingway("I was tired and very interested.").issues.some((i) => i.rule === "passive-voice")).toBe(false);
  });
});

describe("style reports", () => {
  it("finds sticky sentences", () => {
    const r = stickySentences("It is one of the things that is in the way of the work that we do for them.");
    expect(r.issues).toHaveLength(1);
  });

  it("finds repeated phrases", () => {
    const r = repeats("We need to improve customer service quality. Later we will improve customer service again.");
    expect(r.issues.length).toBeGreaterThanOrEqual(2);
  });

  it("catches emotion telling", () => {
    expect(showDontTell("She felt very angry. He was nervous.").issues).toHaveLength(2);
  });

  it("flags fancy dialogue tags and adverbs on tags", () => {
    const r = dialogue(`"Get out," she hissed. "Fine," he said quietly.`);
    expect(r.issues.map((i) => i.rule).sort()).toEqual(["dialogue-adverb", "fancy-dialogue-tag"]);
  });
});

describe("consistency", () => {
  it("flags US spellings for Australian English", () => {
    expect(dialectSpelling("color", "en-AU")).toBe("colour");
    expect(dialectSpelling("Organize", "en-AU")).toBe("Organise");
    expect(dialectSpelling("analyzed", "en-AU")).toBe("analysed");
    expect(dialectSpelling("size", "en-AU")).toBeNull();
    expect(dialectSpelling("colour", "en-US")).toBe("color");
    expect(dialectSpelling("organise", "en-US")).toBe("organize");
    expect(dialectSpelling("promise", "en-US")).toBeNull();
  });

  it("flags hyphenation and capitalisation mixes", () => {
    const r = consistency("Send an e-mail today. I will email you about the Internet and the internet.", "en-AU");
    const rules = r.issues.map((i) => i.rule);
    expect(rules).toContain("hyphenation-mix");
    expect(rules).toContain("capitalisation-mix");
  });

  it("flags mixed citation styles", () => {
    const r = citations("As shown (Smith, 2020) and later [2], also (Jones, 2019) and (Lee 2018).");
    expect(r.issues.some((i) => i.rule === "citation-style-mix")).toBe(true);
    expect(r.issues.some((i) => i.rule === "citation-format")).toBe(true);
  });

  it("suggests inclusive alternatives", () => {
    const r = inclusive("The chairman asked for more manpower.");
    expect(r.issues.map((i) => i.replacements[0])).toEqual(["chair", "workforce"]);
  });
});

describe("tone", () => {
  it("reads tentative writing as tentative", () => {
    const tones = detectTone("I think maybe we could perhaps try this, if that's okay? I guess it might work.");
    expect(tones[0]?.key).toBe("tentative");
  });
});

describe("style guide and fixes", () => {
  it("applies brand rules", () => {
    const issues = applyStyleGuide("Welcome to clickstarter. Our customers love it.", {
      name: "Clickstarter style",
      rules: [{ term: "Clickstarter", replacement: "Clickstarter" }, { term: "customers", replacement: "clients" }],
    });
    expect(issues.map((i) => i.replacements[0])).toEqual(["Clickstarter", "clients"]);
  });

  it("removes a word cleanly", () => {
    expect(applyFix("It is very good.", { offset: 6, length: 4 }, "").text).toBe("It is good.");
  });

  it("prefers LanguageTool spelling over the dialect check on the same word", () => {
    const lt = { id: "a", offset: 0, length: 5, category: "spelling" as const, rule: "LT", message: "", replacements: ["colour"], severity: "error" as const, source: "languagetool" as const };
    const core = { ...lt, id: "b", category: "consistency" as const, rule: "dialect-spelling", source: "core" as const };
    expect(mergeIssues([core], [lt])).toHaveLength(1);
    expect(mergeIssues([core], [lt])[0]!.source).toBe("languagetool");
  });
});

describe("analyse", () => {
  const text =
    "The new policy was implemented by management. It is very important that we utilise our resources efficiently in order to reach our goals.\n\nAt the end of the day, the team will collaborate together on the final outcome.";

  it("returns stats, reports, tone and inline issues", () => {
    const res = analyse(text, { plan: "pro", language: "en-AU", documentType: "business" });
    expect(res.stats.words).toBeGreaterThan(30);
    expect(res.reports.cliches).toBeDefined();
    expect(res.issues.length).toBeGreaterThan(3);
    expect(res.goals.length).toBeGreaterThan(3);
    expect(res.score).toBeGreaterThan(0);
  });

  it("locks Pro reports on the Free plan", () => {
    const res = analyse(text, { plan: "free" });
    expect(res.reports.dialogue).toMatchObject({ locked: true });
    expect(res.reports.cliches).not.toHaveProperty("locked");
  });

  it("truncates style reports past the Free word limit but keeps full stats", () => {
    const long = "This is a short simple sentence. ".repeat(300);
    const res = analyse(long, { plan: "free" });
    expect(res.truncated).toBe(true);
    expect(res.stats.words).toBe(1800);
  });

  it("respects the personal dictionary", () => {
    const res = analyse("I love the color red.", { plan: "pro", dictionary: ["color"] });
    expect(res.issues.some((i) => i.rule === "dialect-spelling")).toBe(false);
  });
});

describe("author comparison", () => {
  it("measures a profile and compares with a preset", () => {
    const p = profileText(`"Run," she said. They ran. The night was cold and the road was long.`);
    expect(p.dialogueShare).toBeGreaterThan(0);
    const diff = compareProfiles(p, PRESET_PROFILES[0]!);
    expect(diff).toHaveLength(8);
  });
});

describe("adverbs and names", () => {
  it("skips capitalised names mid-sentence but keeps sentence-initial adverbs", () => {
    const rules = (t: string) => hemingway(t).issues.filter((i) => i.rule === "adverb").map((i) => t.slice(i.offset, i.offset + i.length));
    expect(rules("Welcome to Gramwritingly today.")).toEqual([]);
    expect(rules("Quickly, she ran. Sadly it ended.")).toEqual(["Quickly", "Sadly"]);
  });
});
