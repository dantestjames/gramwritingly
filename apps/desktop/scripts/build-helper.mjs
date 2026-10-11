/**
 * Builds the Swift helper and copies it where Tauri expects a sidecar:
 *   src-tauri/binaries/gw-helper-<target-triple>
 * Pass --universal to build one binary for Apple silicon and Intel.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, chmodSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") {
  console.log("Skipping gw-helper: it only builds on macOS.");
  process.exit(0);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = join(root, "helpers", "macos");
const universal = process.argv.includes("--universal");
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });

const args = ["build", "-c", "release", "--product", "gw-helper"];
if (universal) args.push("--arch", "arm64", "--arch", "x86_64");
run("swift", args, { cwd: pkg });

const binPath = execFileSync("swift", [...args.slice(0, 3), ...args.slice(5), "--show-bin-path"], { cwd: pkg }).toString().trim();
// A universal Tauri build compiles each architecture separately and then merges them, so it
// looks for the sidecar under all three names. The fat binary serves every one of them.
const triples = universal
  ? ["universal-apple-darwin", "aarch64-apple-darwin", "x86_64-apple-darwin"]
  : [execFileSync("rustc", ["-vV"]).toString().match(/host: (\S+)/)[1]];

const out = join(root, "src-tauri", "binaries");
mkdirSync(out, { recursive: true });
for (const triple of triples) {
  const dest = join(out, `gw-helper-${triple}`);
  copyFileSync(join(binPath, "gw-helper"), dest);
  chmodSync(dest, 0o755);
  console.log(`gw-helper -> ${dest}`);
}
