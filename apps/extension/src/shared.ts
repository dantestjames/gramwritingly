import type { Issue, Language } from "@gramwritingly/core";

export interface ExtSettings {
  apiUrl: string;
  webUrl: string;
  token: string | null;
  language: Language;
  enabled: boolean;
  disabledSites: string[];
  /** Show Hemingway readability highlights inside other sites (off by default: too busy). */
  readabilityInline: boolean;
}

export const DEFAULT_SETTINGS: ExtSettings = {
  apiUrl: "http://localhost:8787",
  webUrl: "http://localhost:5173",
  token: null,
  language: "en-AU",
  enabled: true,
  disabledSites: [],
  readabilityInline: false,
};

export async function getSettings(): Promise<ExtSettings> {
  const stored = (await chrome.storage.local.get("settings")) as { settings?: Partial<ExtSettings> };
  return { ...DEFAULT_SETTINGS, ...(stored.settings ?? {}) };
}

export async function saveSettings(patch: Partial<ExtSettings>): Promise<ExtSettings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export type Message =
  | { type: "check"; text: string }
  | { type: "rewrite"; text: string; mode: string }
  | { type: "synonyms"; word: string; context: string }
  | { type: "addWord"; word: string }
  | { type: "snippets" }
  | { type: "status" }
  | { type: "login"; email: string; password: string }
  | { type: "logout" };

export interface CheckReply {
  issues: Issue[];
  source: "server" | "local";
  plan: "free" | "pro";
}

export interface StatusReply {
  settings: ExtSettings;
  signedIn: boolean;
  email?: string;
  plan?: string;
  aiCreditsUsed?: number;
  aiCreditsLimit?: number | null;
  server: boolean;
}

export type Reply<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

export async function send<T>(msg: Message): Promise<Reply<T>> {
  try {
    return (await chrome.runtime.sendMessage(msg)) as Reply<T>;
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function siteKey(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
