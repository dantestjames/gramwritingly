import { PLANS } from "@gramwritingly/core";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hashPassword, signToken, verifyPassword } from "../lib/auth.js";
import { HttpError, loadUser, requireUser, type Deps } from "../lib/context.js";
import { getUsage } from "../services/usage.js";

const Register = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  name: z.string().max(100).optional(),
});

const Login = z.object({ email: z.string().email(), password: z.string().min(1) });

const Settings = z
  .object({
    language: z.enum(["en-AU", "en-GB", "en-NZ", "en-US", "en-CA", "en-ZA"]),
    documentType: z.enum(["general", "business", "academic", "technical", "fiction", "web", "email", "social"]),
    voiceSample: z.string().max(5000),
    disabledSites: z.array(z.string().max(200)).max(500),
    hiddenInline: z.array(z.string().max(50)).max(50),
    targetGrade: z.number().int().min(1).max(20),
    name: z.string().max(100),
  })
  .partial();

export function authRoutes(app: FastifyInstance, { db, config }: Deps) {
  app.post("/auth/register", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req) => {
    const body = Register.parse(req.body);
    const exists = db.prepare("SELECT 1 FROM users WHERE email = ?").get(body.email);
    if (exists) throw new HttpError(409, "email_taken", "An account with that email already exists.");
    const id = randomUUID();
    db.prepare("INSERT INTO users (id, email, name, password_hash, settings) VALUES (?, ?, ?, ?, ?)").run(
      id, body.email, body.name ?? "", await hashPassword(body.password), JSON.stringify({ language: config.defaultLanguage }),
    );
    return { token: signToken(id, config.jwtSecret), user: loadUser(db, id) };
  });

  app.post("/auth/login", { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } }, async (req) => {
    const body = Login.parse(req.body);
    const row = db.prepare("SELECT id, password_hash FROM users WHERE email = ?").get(body.email) as
      | { id: string; password_hash: string }
      | undefined;
    if (!row || !(await verifyPassword(body.password, row.password_hash))) {
      throw new HttpError(401, "bad_credentials", "Email or password is wrong.");
    }
    return { token: signToken(row.id, config.jwtSecret), user: loadUser(db, row.id) };
  });

  app.get("/me", async (req) => {
    const user = requireUser(req);
    const plan = PLANS[user.plan];
    const limit = (n: number) => (Number.isFinite(n) ? n : null);
    return {
      user,
      plan: { ...plan, limits: Object.fromEntries(Object.entries(plan.limits).map(([k, v]) => [k, limit(v)])) },
      usage: {
        aiCredits: getUsage(db, user.id, "ai_credits"),
        critiques: getUsage(db, user.id, "critiques"),
        sparks: getUsage(db, user.id, "sparks"),
        plagiarism: getUsage(db, user.id, "plagiarism"),
      },
    };
  });

  app.patch("/me", async (req) => {
    const user = requireUser(req);
    const { name, ...settings } = Settings.parse(req.body);
    const merged = { ...user.settings, ...settings };
    db.prepare("UPDATE users SET settings = ?, name = COALESCE(?, name) WHERE id = ?").run(
      JSON.stringify(merged), name ?? null, user.id,
    );
    return { user: loadUser(db, user.id) };
  });

  app.delete("/me", async (req) => {
    const user = requireUser(req);
    db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
    return { deleted: true };
  });
}
