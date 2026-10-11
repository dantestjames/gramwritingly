/**
 * Sets a user's plan until billing is wired up.
 *   pnpm --filter @gramwritingly/server set-plan someone@example.com pro
 */
import { loadConfig } from "../config.js";
import { openDb } from "../db.js";

const [email, plan] = process.argv.slice(2);
if (!email || (plan !== "free" && plan !== "pro")) {
  console.error("Usage: set-plan <email> <free|pro>");
  process.exit(1);
}
const db = openDb(loadConfig().databasePath);
const res = db.prepare("UPDATE users SET plan = ? WHERE email = ?").run(plan, email);
if (res.changes === 0) {
  console.error(`No user with email ${email}`);
  process.exit(1);
}
console.log(`${email} is now on ${plan}.`);
