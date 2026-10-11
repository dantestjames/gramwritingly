import { analyse, filterDictionary, mergeIssues, type Issue, type ReportId, type StyleGuide } from "@gramwritingly/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { planOf, type Deps } from "../lib/context.js";

export const LanguageSchema = z.enum(["en-AU", "en-GB", "en-NZ", "en-US", "en-CA", "en-ZA"]);
export const DocTypeSchema = z.enum(["general", "business", "academic", "technical", "fiction", "web", "email", "social"]);

const Check = z.object({
  text: z.string().max(400_000),
  language: LanguageSchema.optional(),
  documentType: DocTypeSchema.optional(),
  /** Run only these reports (faster for the browser extension). */
  reports: z.array(z.string()).max(40).optional(),
  /** Skip LanguageTool (style-only check). */
  skipGrammar: z.boolean().optional(),
});

export function checkRoutes(app: FastifyInstance, { db, lt, config }: Deps) {
  app.post("/check", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req) => {
    const body = Check.parse(req.body);
    const user = req.user;
    const plan = planOf(req);
    const language = body.language ?? (user?.settings.language as typeof body.language) ?? (config.defaultLanguage as "en-AU");
    const documentType = body.documentType ?? (user?.settings.documentType as typeof body.documentType) ?? "general";

    const dictionary = user
      ? (db.prepare("SELECT word FROM dictionary WHERE user_id = ?").all(user.id) as { word: string }[]).map((r) => r.word)
      : [];
    const guideRow = user
      ? (db.prepare("SELECT guide FROM style_guides WHERE user_id = ?").get(user.id) as { guide: string } | undefined)
      : undefined;
    const styleGuide = guideRow ? (JSON.parse(guideRow.guide) as StyleGuide) : undefined;

    const core = analyse(body.text, {
      language, documentType, plan, dictionary, styleGuide,
      reports: body.reports as ReportId[] | undefined,
    });

    let grammar: Issue[] = [];
    let grammarStatus: "ok" | "unavailable" | "skipped" = "skipped";
    if (!body.skipGrammar && body.text.trim()) {
      try {
        grammar = filterDictionary(body.text, await lt.check(body.text, language, { picky: plan === "pro" }), dictionary);
        grammarStatus = "ok";
      } catch (err) {
        req.log.warn({ err: (err as Error).message }, "LanguageTool unavailable");
        grammarStatus = "unavailable";
      }
    }

    const hidden = new Set(user?.settings.hiddenInline ?? []);
    const issues = mergeIssues(grammar, core.issues).filter((i) => !i.report || !hidden.has(i.report));
    const counts = {
      correctness: issues.filter((i) => ["spelling", "grammar", "punctuation"].includes(i.category)).length,
      clarity: issues.filter((i) => ["clarity", "readability"].includes(i.category)).length,
      style: issues.filter((i) => ["style", "consistency", "styleguide", "inclusive", "tone"].includes(i.category)).length,
    };
    return { ...core, issues, counts, grammarStatus, plan };
  });
}
