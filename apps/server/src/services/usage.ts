import type { DB } from "../db.js";

export type UsageKind = "ai_credits" | "critiques" | "sparks" | "plagiarism" | "feedback";

export function period(kind: UsageKind, now = new Date()): string {
  const iso = now.toISOString();
  // Daily quotas reset each day, credits and scans each month.
  return kind === "critiques" || kind === "sparks" || kind === "feedback" ? iso.slice(0, 10) : iso.slice(0, 7);
}

export function getUsage(db: DB, userId: string, kind: UsageKind): number {
  const row = db
    .prepare("SELECT amount FROM usage WHERE user_id = ? AND kind = ? AND period = ?")
    .get(userId, kind, period(kind)) as { amount: number } | undefined;
  return row?.amount ?? 0;
}

export function addUsage(db: DB, userId: string, kind: UsageKind, amount: number) {
  db.prepare(
    `INSERT INTO usage (user_id, kind, period, amount) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, kind, period) DO UPDATE SET amount = amount + excluded.amount`,
  ).run(userId, kind, period(kind), amount);
}

export class QuotaError extends Error {
  constructor(public kind: UsageKind, public limit: number) {
    super(
      limit === 0
        ? "This feature is part of Pro."
        : `You have used your ${kind.replace("_", " ")} allowance (${limit}). It resets ${kind === "ai_credits" || kind === "plagiarism" ? "next month" : "tomorrow"}.`,
    );
  }
}

/**
 * Checks the limit and records the usage in one synchronous step, so parallel requests
 * can't all slip under the limit while a slow AI or plagiarism call is in flight.
 * Returns a refund function to call if the external call fails.
 */
export function reserve(db: DB, userId: string, kind: UsageKind, limit: number, cost = 1): () => void {
  assertQuota(db, userId, kind, limit, cost);
  addUsage(db, userId, kind, cost);
  let refunded = false;
  return () => {
    if (refunded) return;
    refunded = true;
    addUsage(db, userId, kind, -cost);
  };
}

/** Throws QuotaError when the request would go over the limit. */
export function assertQuota(db: DB, userId: string, kind: UsageKind, limit: number, cost = 1) {
  if (!Number.isFinite(limit)) return;
  const used = getUsage(db, userId, kind);
  if (used + cost > limit) throw new QuotaError(kind, limit);
}
