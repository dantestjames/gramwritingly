/**
 * Builds the extension for each browser family:
 *   dist/chromium  Chrome, Edge, Opera, Brave, Vivaldi (Manifest V3, service worker)
 *   dist/firefox   Firefox (Manifest V3, event page background)
 *   dist/safari    Same bundle as Chromium, ready for `xcrun safari-web-extension-converter` on a Mac
 */
import { build, context } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const watch = process.argv.includes("--watch");

const base = {
  manifest_version: 3,
  name: "Gramwritingly",
  short_name: "Gramwritingly",
  version: pkg.version,
  description: "Spelling, grammar, readability and AI rewrites in every text box you type in.",
  icons: { 16: "icons/icon-16.png", 32: "icons/icon-32.png", 48: "icons/icon-48.png", 128: "icons/icon-128.png" },
  action: { default_title: "Gramwritingly", default_popup: "popup.html", default_icon: { 16: "icons/icon-16.png", 32: "icons/icon-32.png" } },
  options_ui: { page: "options.html", open_in_tab: true },
  permissions: ["storage", "contextMenus", "activeTab"],
  host_permissions: ["<all_urls>"],
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["content.js"],
      run_at: "document_idle",
      all_frames: true,
    },
  ],
};

const targets = {
  chromium: { ...base, background: { service_worker: "background.js" }, minimum_chrome_version: "116" },
  firefox: {
    ...base,
    background: { scripts: ["background.js"] },
    browser_specific_settings: {
      gecko: {
        id: "extension@gramwritingly.app",
        strict_min_version: "140.0",
        // Text typed into pages is sent to the user's Gramwritingly server for checking.
        data_collection_permissions: {
          required: ["websiteContent", "personalCommunications"],
          optional: ["authenticationInfo"],
        },
      },
    },
  },
  safari: { ...base, background: { service_worker: "background.js" } },
};

const entries = ["background", "content", "popup", "options"].map((n) => join(root, "src", `${n}.ts`));

async function bundle(outdir) {
  const opts = {
    entryPoints: entries,
    bundle: true,
    format: "iife",
    target: ["chrome116", "firefox140", "safari16"],
    outdir,
    minify: !watch,
    sourcemap: watch ? "inline" : false,
    legalComments: "none",
    logLevel: "warning",
  };
  if (watch) {
    const ctx = await context(opts);
    await ctx.watch();
  } else {
    await build(opts);
  }
}

for (const [name, manifest] of Object.entries(targets)) {
  const out = join(root, "dist", name);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(join(root, "public"), out, { recursive: true });
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  await bundle(out);
  console.log(`Built ${name} -> dist/${name}`);
  if (watch) break; // watch mode only rebuilds Chromium
}
