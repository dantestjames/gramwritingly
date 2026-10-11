import { hasFeature, PLANS, type FeatureKey, type PlanId } from "@gramwritingly/core";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "../config.js";
import type { DB } from "../db.js";
import type { AiService } from "../services/ai.js";
import type { LanguageToolClient } from "../services/languagetool.js";
import type { PlagiarismProvider } from "../services/plagiarism.js";
import { verifyToken } from "./auth.js";

export interface Deps {
  config: Config;
  db: DB;
  lt: LanguageToolClient;
  ai: AiService;
  plagiarism: PlagiarismProvider;
}

export interface UserSettings {
  language?: string;
  documentType?: string;
  /** Sample of the user's writing for AI voice matching. */
  voiceSample?: string;
  /** Sites where the extension should stay off. */
  disabledSites?: string[];
  /** Report ids hidden from inline underlines. */
  hiddenInline?: string[];
  targetGrade?: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  plan: PlanId;
  settings: UserSettings;
}

declare module "fastify" {
  interface FastifyRequest {
    user: User | null;
  }
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function loadUser(db: DB, id: string): User | null {
  const row = db.prepare("SELECT id, email, name, plan, settings FROM users WHERE id = ?").get(id) as
    | { id: string; email: string; name: string; plan: string; settings: string }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    plan: row.plan in PLANS ? (row.plan as PlanId) : "free",
    settings: JSON.parse(row.settings || "{}") as UserSettings,
  };
}

export function authHook(deps: Deps) {
  return async (req: FastifyRequest) => {
    req.user = null;
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return;
    const payload = verifyToken(header.slice(7), deps.config.jwtSecret);
    if (payload) req.user = loadUser(deps.db, payload.sub);
  };
}

export function requireUser(req: FastifyRequest): User {
  if (!req.user) throw new HttpError(401, "unauthorised", "Sign in to use this feature.");
  return req.user;
}

export function requireFeature(user: User, feature: FeatureKey): void {
  if (!hasFeature(user.plan, feature)) {
    throw new HttpError(403, "pro_required", "This feature is part of Pro.");
  }
}

export function planOf(req: FastifyRequest): PlanId {
  return req.user?.plan ?? "free";
}

export type Reply = FastifyReply;
