import { PLANS } from "@gramwritingly/core";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError, requireFeature, requireUser, type Deps } from "../lib/context.js";
import { DocTypeSchema, LanguageSchema } from "./check.js";

const DocumentBody = z
  .object({
    title: z.string().max(300),
    content: z.string().max(2_000_000),
    documentType: DocTypeSchema,
    language: LanguageSchema,
    storyCanvas: z.record(z.string(), z.unknown()),
  })
  .partial();

const StyleGuideBody = z.object({
  name: z.string().min(1).max(100),
  rules: z
    .array(
      z.object({
        term: z.string().min(1).max(100),
        replacement: z.string().max(200).optional(),
        note: z.string().max(300).optional(),
        caseSensitive: z.boolean().optional(),
      }),
    )
    .max(1000),
  brandTones: z.array(z.enum(["confident", "tentative", "friendly", "formal", "casual", "urgent", "positive", "negative"])).max(4).optional(),
});

const SnippetBody = z.object({
  shortcut: z.string().min(2).max(40).regex(/^\S+$/, "No spaces in shortcuts"),
  body: z.string().min(1).max(10_000),
});

interface DocRow {
  id: string; title: string; content: string; document_type: string; language: string;
  story_canvas: string; created_at: string; updated_at: string;
}

const toDoc = (r: DocRow) => ({
  id: r.id, title: r.title, content: r.content, documentType: r.document_type, language: r.language,
  storyCanvas: JSON.parse(r.story_canvas || "{}"), createdAt: r.created_at, updatedAt: r.updated_at,
});

export function dataRoutes(app: FastifyInstance, { db }: Deps) {
  // ---- Documents ---------------------------------------------------------
  app.get("/documents", async (req) => {
    const user = requireUser(req);
    const rows = db
      .prepare("SELECT id, title, substr(content, 1, 200) AS content, document_type, language, '{}' AS story_canvas, created_at, updated_at FROM documents WHERE user_id = ? ORDER BY updated_at DESC")
      .all(user.id) as unknown as DocRow[];
    return { documents: rows.map(toDoc) };
  });

  app.get("/documents/:id", async (req) => {
    const user = requireUser(req);
    const { id } = req.params as { id: string };
    const row = db.prepare("SELECT * FROM documents WHERE id = ? AND user_id = ?").get(id, user.id) as DocRow | undefined;
    if (!row) throw new HttpError(404, "not_found", "Document not found.");
    return toDoc(row);
  });

  app.post("/documents", async (req) => {
    const user = requireUser(req);
    const body = DocumentBody.parse(req.body ?? {});
    const count = (db.prepare("SELECT COUNT(*) AS n FROM documents WHERE user_id = ?").get(user.id) as { n: number }).n;
    if (count >= PLANS[user.plan].limits.documents) {
      throw new HttpError(402, "quota", `Free accounts can store ${PLANS.free.limits.documents} documents. Delete one or upgrade to Pro.`);
    }
    const id = randomUUID();
    db.prepare(
      "INSERT INTO documents (id, user_id, title, content, document_type, language, story_canvas) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id, user.id, body.title ?? "Untitled", body.content ?? "", body.documentType ?? "general",
      body.language ?? user.settings.language ?? "en-AU", JSON.stringify(body.storyCanvas ?? {}),
    );
    return toDoc(db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as unknown as DocRow);
  });

  app.put("/documents/:id", async (req) => {
    const user = requireUser(req);
    const { id } = req.params as { id: string };
    const body = DocumentBody.parse(req.body ?? {});
    const res = db
      .prepare(
        `UPDATE documents SET
           title = COALESCE(?, title), content = COALESCE(?, content), document_type = COALESCE(?, document_type),
           language = COALESCE(?, language), story_canvas = COALESCE(?, story_canvas), updated_at = datetime('now')
         WHERE id = ? AND user_id = ?`,
      )
      .run(
        body.title ?? null, body.content ?? null, body.documentType ?? null, body.language ?? null,
        body.storyCanvas ? JSON.stringify(body.storyCanvas) : null, id, user.id,
      );
    if (res.changes === 0) throw new HttpError(404, "not_found", "Document not found.");
    return toDoc(db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as unknown as DocRow);
  });

  app.delete("/documents/:id", async (req) => {
    const user = requireUser(req);
    const { id } = req.params as { id: string };
    db.prepare("DELETE FROM documents WHERE id = ? AND user_id = ?").run(id, user.id);
    return { deleted: true };
  });

  // ---- Personal dictionary ----------------------------------------------
  app.get("/dictionary", async (req) => {
    const user = requireUser(req);
    const rows = db.prepare("SELECT word FROM dictionary WHERE user_id = ? ORDER BY word").all(user.id) as { word: string }[];
    return { words: rows.map((r) => r.word) };
  });

  app.post("/dictionary", async (req) => {
    const user = requireUser(req);
    const { word } = z.object({ word: z.string().min(1).max(60) }).parse(req.body);
    db.prepare("INSERT OR IGNORE INTO dictionary (user_id, word) VALUES (?, ?)").run(user.id, word.trim());
    return { added: word.trim() };
  });

  app.delete("/dictionary/:word", async (req) => {
    const user = requireUser(req);
    const { word } = req.params as { word: string };
    db.prepare("DELETE FROM dictionary WHERE user_id = ? AND word = ?").run(user.id, word);
    return { deleted: true };
  });

  // ---- Style guide (Pro) -------------------------------------------------
  app.get("/styleguide", async (req) => {
    const user = requireUser(req);
    const row = db.prepare("SELECT guide FROM style_guides WHERE user_id = ?").get(user.id) as { guide: string } | undefined;
    return { guide: row ? JSON.parse(row.guide) : null };
  });

  app.put("/styleguide", async (req) => {
    const user = requireUser(req);
    requireFeature(user, "styleGuide");
    const guide = StyleGuideBody.parse(req.body);
    if (guide.rules.length > PLANS[user.plan].limits.styleGuideRules) {
      throw new HttpError(400, "too_many_rules", `Style guides can hold ${PLANS[user.plan].limits.styleGuideRules} rules.`);
    }
    db.prepare(
      "INSERT INTO style_guides (user_id, guide) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET guide = excluded.guide",
    ).run(user.id, JSON.stringify(guide));
    return { guide };
  });

  // ---- Snippets (Pro) ----------------------------------------------------
  app.get("/snippets", async (req) => {
    const user = requireUser(req);
    const rows = db.prepare("SELECT id, shortcut, body FROM snippets WHERE user_id = ? ORDER BY shortcut").all(user.id);
    return { snippets: rows };
  });

  app.post("/snippets", async (req) => {
    const user = requireUser(req);
    requireFeature(user, "snippets");
    const body = SnippetBody.parse(req.body);
    const count = (db.prepare("SELECT COUNT(*) AS n FROM snippets WHERE user_id = ?").get(user.id) as { n: number }).n;
    if (count >= PLANS[user.plan].limits.snippets) throw new HttpError(402, "quota", "Snippet limit reached.");
    const id = randomUUID();
    try {
      db.prepare("INSERT INTO snippets (id, user_id, shortcut, body) VALUES (?, ?, ?, ?)").run(id, user.id, body.shortcut, body.body);
    } catch {
      throw new HttpError(409, "duplicate", `You already have a snippet called ${body.shortcut}.`);
    }
    return { id, ...body };
  });

  app.delete("/snippets/:id", async (req) => {
    const user = requireUser(req);
    const { id } = req.params as { id: string };
    db.prepare("DELETE FROM snippets WHERE id = ? AND user_id = ?").run(id, user.id);
    return { deleted: true };
  });
}
