/** Zips each browser build into artifacts/ for store upload or GitHub Releases. */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const out = join(root, "artifacts");
mkdirSync(out, { recursive: true });

for (const name of ["chromium", "firefox", "safari"]) {
  const file = join(out, `gramwritingly-${name}-${version}.zip`);
  rmSync(file, { force: true });
  execFileSync("zip", ["-qr", file, "."], { cwd: join(root, "dist", name) });
  console.log(`Packaged ${file}`);
}
