import { makeIssue } from "./issue.js";
import { escapeRegExp, matchCase } from "./tokenise.js";
import type { Issue, StyleGuide } from "./types.js";

/** Checks text against a custom style guide (brand terms, banned words, preferred spellings). */
export function applyStyleGuide(text: string, guide: StyleGuide | undefined): Issue[] {
  if (!guide) return [];
  const out: Issue[] = [];
  for (const rule of guide.rules) {
    if (!rule.term.trim()) continue;
    const re = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(rule.term.trim()).replace(/ /g, "\\s+")}(?![\\p{L}\\p{N}])`,
      rule.caseSensitive ? "gu" : "giu",
    );
    for (const m of text.matchAll(re)) {
      // A case-insensitive rule whose replacement differs only in case (e.g. "Clickstarter")
      // should not flag text that already matches exactly.
      if (rule.replacement && m[0] === rule.replacement) continue;
      const replacement = rule.replacement
        ? rule.replacement.toLowerCase() === rule.term.toLowerCase()
          ? rule.replacement
          : matchCase(m[0], rule.replacement)
        : "";
      out.push({
        ...makeIssue({
          offset: m.index!, length: m[0].length, rule: `styleguide:${rule.term.toLowerCase()}`, category: "styleguide",
          severity: "warning", title: guide.name,
          message: rule.note ?? (rule.replacement ? `${guide.name} says use "${rule.replacement}".` : `${guide.name} says avoid "${rule.term}".`),
          replacements: replacement ? [replacement] : [],
        }),
        source: "styleguide",
      });
    }
  }
  return out;
}

/** Drops spelling issues for words in the user's personal dictionary. */
export function filterDictionary(text: string, issues: Issue[], dictionary: string[] | undefined): Issue[] {
  if (!dictionary?.length) return issues;
  const dict = new Set(dictionary.map((w) => w.toLowerCase()));
  return issues.filter((i) => {
    if (i.category !== "spelling" && i.rule !== "dialect-spelling") return true;
    return !dict.has(text.slice(i.offset, i.offset + i.length).toLowerCase());
  });
}
