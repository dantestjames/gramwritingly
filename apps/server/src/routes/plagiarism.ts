import { PLANS, words } from "@gramwritingly/core";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError, requireFeature, requireUser, type Deps } from "../lib/context.js";
import { reserve } from "../services/usage.js";

const Submit = z.object({ text: z.string().min(1).max(100_000) });

/** Plagiarism checks are Pro only and metered per scan. */
export function plagiarismRoutes(app: FastifyInstance, { db, plagiarism, config }: Deps) {
  const sign = (scanId: string) => createHmac("sha256", config.jwtSecret).update(`plag:${scanId}`).digest("base64url").slice(0, 32);

  app.post("/plagiarism", async (req) => {
    const user = requireUser(req);
    requireFeature(user, "plagiarism");
    if (!plagiarism.configured) {
      throw new HttpError(503, "not_configured", "Plagiarism checking is not set up on this server yet.");
    }
    const { text } = Submit.parse(req.body);
    if (words(text).length < 15) throw new HttpError(400, "too_short", "Add at least 15 words to check for plagiarism.");
    const refund = reserve(db, user.id, "plagiarism", PLANS[user.plan].limits.plagiarismScansPerMonth);
    const scanId = randomUUID().replace(/-/g, "").slice(0, 30);
    db.prepare("INSERT INTO plagiarism_scans (id, user_id) VALUES (?, ?)").run(scanId, user.id);
    const callback = `${config.publicApiUrl}/webhooks/${plagiarism.name}/{STATUS}/${scanId}/${sign(scanId)}`;
    try {
      await plagiarism.submit(scanId, text, callback);
    } catch (err) {
      db.prepare("UPDATE plagiarism_scans SET status = 'error' WHERE id = ?").run(scanId);
      refund();
      throw err;
    }
    return { scanId, status: "pending" };
  });

  app.get("/plagiarism/:id", async (req) => {
    const user = requireUser(req);
    const { id } = req.params as { id: string };
    const row = db.prepare("SELECT status, result FROM plagiarism_scans WHERE id = ? AND user_id = ?").get(id, user.id) as
      | { status: string; result: string | null }
      | undefined;
    if (!row) throw new HttpError(404, "not_found", "Scan not found.");
    return { scanId: id, status: row.status, result: row.result ? JSON.parse(row.result) : null };
  });

  app.post("/webhooks/:provider/:status/:scanId/:sig", async (req, reply) => {
    const { provider, status, scanId, sig } = req.params as { provider: string; status: string; scanId: string; sig: string };
    const expected = Buffer.from(sign(scanId));
    const given = Buffer.from(sig);
    if (provider !== plagiarism.name || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return reply.code(404).send();
    }
    if (status === "completed") {
      const result = plagiarism.parseCompleted(req.body);
      db.prepare("UPDATE plagiarism_scans SET status = 'completed', result = ? WHERE id = ?").run(JSON.stringify(result), scanId);
    } else if (status === "error") {
      db.prepare("UPDATE plagiarism_scans SET status = 'error' WHERE id = ?").run(scanId);
    }
    return { ok: true };
  });
}
