import type { Issue, Language } from "@gramwritingly/core";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { openUrl } from "@tauri-apps/plugin-opener";
import { checkText } from "./engine";

interface Settings {
  apiUrl: string;
  webUrl: string;
  token: string | null;
  language: Language;
  enabled: boolean;
  disabledApps: string[];
  dictionary: string[];
}

const DEFAULTS: Settings = {
  apiUrl: "http://localhost:8787",
  webUrl: "http://localhost:5173",
  token: null,
  language: "en-AU",
  enabled: true,
  disabledApps: [],
  dictionary: [],
};

function load(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem("gw.desktop") ?? "{}") as Partial<Settings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

let settings = load();
function save(patch: Partial<Settings>) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem("gw.desktop", JSON.stringify(settings));
  } catch {
    /* storage unavailable */
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---- API ------------------------------------------------------------------
async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${settings.apiUrl}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(settings.token ? { Authorization: `Bearer ${settings.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  if (res.status === 401 && settings.token && !path.startsWith("/auth/")) {
    save({ token: null });
    renderAccount();
  }
  if (!res.ok) throw new Error(data.message ?? `Request failed (${res.status})`);
  return data as T;
}

// ---- Helper bridge --------------------------------------------------------
type HelperMessage =
  | { type: "ready" | "trust"; trusted: boolean }
  | { type: "text"; seq: number; app: string; appName: string; text: string }
  | { type: "focus-lost" }
  | { type: "add-word"; word: string }
  | { type: "rewrite"; requestId: number; text: string; mode: string }
  | { type: "exited"; code: number | null };

let helperAlive = false;
let trusted = false;
let appTrusted = false;
let lastSource: "server" | "local" | null = null;
let serverReachable: boolean | null = null;
const logLines: string[] = [];

function log(line: string) {
  const stamp = new Date().toLocaleTimeString("en-AU");
  logLines.push(`${stamp}  ${line}`);
  if (logLines.length > 60) logLines.shift();
  const box = document.getElementById("log");
  if (box) box.textContent = logLines.join("\n");
}

function send(msg: Record<string, unknown>) {
  return invoke("helper_send", { line: JSON.stringify(msg) }).catch((err) => setStatus(String(err)));
}

function sendConfig() {
  send({ type: "config", enabled: settings.enabled, disabledApps: settings.disabledApps });
}

async function onHelper(raw: string) {
  let msg: HelperMessage;
  try {
    msg = JSON.parse(raw) as HelperMessage;
  } catch {
    return;
  }
  switch (msg.type) {
    case "ready":
    case "trust":
      helperAlive = true;
      trusted = msg.trusted;
      log(`helper ${msg.type}: trusted=${msg.trusted}`);
      if (msg.type === "ready") sendConfig();
      appTrusted = await invoke<boolean>("app_trusted").catch(() => false);
      renderStatus();
      break;
    case "text": {
      $("app-line").textContent = `Checking ${msg.appName}`;
      const result = await checkText(msg.text, { language: settings.language, dictionary: settings.dictionary }, {
        serverCheck: (text, language) => api<{ issues: Issue[] }>("/check", { text, language }),
      });
      lastSource = result.source;
      send({ type: "issues", seq: msg.seq, issues: result.issues });
      $("app-line").textContent = `${msg.appName}: ${result.issues.length} suggestion${result.issues.length === 1 ? "" : "s"}`;
      renderStatus();
      break;
    }
    case "focus-lost":
      $("app-line").textContent = "";
      break;
    case "add-word":
      save({ dictionary: [...new Set([...settings.dictionary, msg.word])] });
      if (settings.token) api("/dictionary", { word: msg.word }).catch(() => undefined);
      break;
    case "rewrite":
      try {
        const r = await api<{ variants: string[] }>("/ai/rewrite", { text: msg.text, mode: msg.mode, language: settings.language });
        send({ type: "rewrite-result", requestId: msg.requestId, variants: r.variants });
      } catch (err) {
        const message = settings.token ? (err as Error).message : "Sign in to Gramwritingly to use AI rewrites.";
        send({ type: "rewrite-result", requestId: msg.requestId, error: message });
      }
      break;
    case "exited":
      // Only sent for an unexpected exit. Restart once after a pause; never in a tight loop.
      helperAlive = false;
      renderStatus();
      restartHelper(5000);
      break;
  }
}

let restartTimer: number | undefined;
function restartHelper(delay: number) {
  clearTimeout(restartTimer);
  restartTimer = window.setTimeout(() => {
    log("starting helper");
    invoke("helper_start").catch((err) => log(`could not start helper: ${err}`));
  }, delay);
}

// ---- UI -------------------------------------------------------------------
function setStatus(text: string) {
  $("status").textContent = text;
}

function renderStatus() {
  $("trust").hidden = !helperAlive || trusted;
  // macOS sometimes grants access to the app but only applies it to processes started afterwards.
  $("trust-restart").hidden = !appTrusted;
  if (!helperAlive) return setStatus("Starting the text checker…");
  if (!trusted) {
    return setStatus(appTrusted ? "Access granted. Restart the checker to use it." : "Waiting for Accessibility access.");
  }
  if (!settings.enabled) return setStatus("Paused. Turn it back on with the switch above.");
  setStatus(lastSource === "local" ? "Checking (offline: style checks only)" : "Checking your writing in other apps.");
}

async function checkServer() {
  try {
    await api("/health");
    serverReachable = true;
  } catch {
    serverReachable = false;
  }
  $("no-server").hidden = serverReachable !== false;
  $("server-url").textContent = settings.apiUrl;
  $("account-forms").hidden = serverReachable === false;
}

async function renderAccount() {
  const signedIn = !!settings.token;
  $("signed-in").hidden = !signedIn;
  $("signed-out").hidden = signedIn;
  await checkServer();
  if (!signedIn) return;
  try {
    const me = await api<{ user: { email: string }; plan: { name: string } }>("/me");
    $("who").textContent = me.user.email;
    $("plan").textContent = me.plan.name;
    const dict = await api<{ words: string[] }>("/dictionary");
    save({ dictionary: [...new Set([...settings.dictionary, ...dict.words])] });
  } catch {
    $("who").textContent = "Offline";
  }
}

function bindSettings() {
  const enabled = $<HTMLInputElement>("enabled");
  enabled.checked = settings.enabled;
  enabled.addEventListener("change", () => {
    save({ enabled: enabled.checked });
    sendConfig();
    renderStatus();
  });

  const language = $<HTMLSelectElement>("language");
  language.value = settings.language;
  language.addEventListener("change", () => save({ language: language.value as Language }));

  const apps = $<HTMLTextAreaElement>("disabled-apps");
  apps.value = settings.disabledApps.join("\n");
  apps.addEventListener("change", () => {
    save({ disabledApps: apps.value.split(/\s+/).map((s) => s.trim()).filter(Boolean) });
    sendConfig();
  });

  const apiUrl = $<HTMLInputElement>("api-url");
  const webUrl = $<HTMLInputElement>("web-url");
  apiUrl.value = settings.apiUrl;
  webUrl.value = settings.webUrl;
  apiUrl.addEventListener("change", () => {
    save({ apiUrl: apiUrl.value.trim().replace(/\/$/, "") });
    renderAccount();
  });
  webUrl.addEventListener("change", () => save({ webUrl: webUrl.value.trim().replace(/\/$/, "") }));

  const autostart = $<HTMLInputElement>("autostart");
  isEnabled().then((on) => (autostart.checked = on)).catch(() => undefined);
  autostart.addEventListener("change", () => (autostart.checked ? enable() : disable()).catch(() => undefined));

  $("grant").addEventListener("click", () => send({ type: "request-trust" }));
  $("restart").addEventListener("click", () => restartHelper(0));
  $("copy-log").addEventListener("click", () => navigator.clipboard.writeText(logLines.join("\n")).catch(() => undefined));

  let registering = false;
  $("toggle-register").addEventListener("click", () => {
    registering = !registering;
    $("name").hidden = !registering;
    $("login-button").textContent = registering ? "Create account" : "Sign in";
    $("toggle-register").textContent = registering ? "Already have an account? Sign in" : "New here? Create a free account";
    $<HTMLInputElement>("password").autocomplete = registering ? "new-password" : "current-password";
  });
  $("open-editor").addEventListener("click", () => openUrl(settings.webUrl));

  $("login").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("error").textContent = "";
    try {
      const registering = !$("name").hidden;
      const r = await api<{ token: string }>(registering ? "/auth/register" : "/auth/login", {
        email: $<HTMLInputElement>("email").value,
        password: $<HTMLInputElement>("password").value,
        ...(registering ? { name: $<HTMLInputElement>("name").value } : {}),
      });
      save({ token: r.token });
      await renderAccount();
    } catch (err) {
      $("error").textContent = (err as Error).message;
    }
  });
  $("logout").addEventListener("click", () => {
    save({ token: null });
    renderAccount();
  });
}

async function main() {
  bindSettings();
  renderAccount();
  await listen<string>("helper-message", (e) => onHelper(e.payload));
  await listen<string>("helper-log", (e) => log(e.payload));
  await listen("tray-toggle", () => {
    save({ enabled: !settings.enabled });
    $<HTMLInputElement>("enabled").checked = settings.enabled;
    sendConfig();
    renderStatus();
  });
  await listen("tray-open-editor", () => openUrl(settings.webUrl));
  // The helper usually starts before this page loads, so its first "ready" is missed.
  // Ask it to say hello again; only start a new one if nothing answers.
  send({ type: "hello" });
  setTimeout(() => {
    if (!helperAlive) restartHelper(0);
  }, 3000);
  // Picks up permission changes made in System Settings while the window was open.
  window.addEventListener("focus", async () => {
    appTrusted = await invoke<boolean>("app_trusted").catch(() => false);
    if (helperAlive && !trusted) send({ type: "hello" });
    renderStatus();
  });
  renderStatus();
}

main();
