import type { Issue } from "@gramwritingly/core";
import { describe, expect, it } from "vitest";
import { checkText, toWire } from "../src/engine";

const lt: Issue = {
  id: "LT:1", offset: 0, length: 5, category: "grammar", rule: "LT:THEIR_IS", message: "Did you mean There?",
  replacements: ["There"], severity: "error", source: "languagetool", title: "Grammar",
};

describe("desktop engine", () => {
  it("keeps corrections, drops colour highlights, marks very hard sentences", () => {
    const text =
      "Notwithstanding considerable organisational restructuring, the implementation of comprehensive interdepartmental communication methodologies necessitated substantial reconfiguration of established procedures. I like the color.";
    return checkText(text, { language: "en-AU", dictionary: [] }, { serverCheck: () => Promise.reject(new Error("offline")) }).then((r) => {
      expect(r.source).toBe("local");
      expect(r.issues.some((i) => i.colour === "purple" && i.replacements[0] === "colour")).toBe(true);
      expect(r.issues.some((i) => i.sentence)).toBe(true);
      expect(r.issues.some((i) => i.title === "Adverb" || i.title === "Simpler alternative")).toBe(false);
    });
  });

  it("uses server grammar and honours the dictionary", async () => {
    const r = await checkText("Their are many Clickstarter clients.", { language: "en-AU", dictionary: [] }, {
      serverCheck: async () => ({ issues: [lt] }),
    });
    expect(r.source).toBe("server");
    expect(r.issues[0]).toMatchObject({ offset: 0, colour: "red", replacements: ["There"], sentence: false });
  });

  it("caps replacements and keeps UTF-16 offsets untouched", () => {
    const wire = toWire([{ ...lt, offset: 3, replacements: ["a", "b", "c", "d"] }]);
    expect(wire[0]!.offset).toBe(3);
    expect(wire[0]!.replacements).toHaveLength(3);
  });
});
