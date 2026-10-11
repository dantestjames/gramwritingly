import type { AnalysisResult, Issue, PlanId, StyleGuide } from "@gramwritingly/core";

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8787";

const TOKEN_KEY = "gw.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked */
  }
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "offline", "Can't reach the Gramwritingly server. Working offline.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? "error", data.message ?? `Request failed (${res.status})`);
  return data as T;
}

export interface Me {
  user: { id: string; email: string; name: string; plan: PlanId; settings: Record<string, unknown> };
  plan: { id: PlanId; name: string; limits: Record<string, number | null>; features: Record<string, boolean> };
  usage: { aiCredits: number; critiques: number; sparks: number; plagiarism: number };
}

export type CheckResponse = AnalysisResult & {
  counts: { correctness: number; clarity: number; style: number };
  grammarStatus: "ok" | "unavailable" | "skipped";
  plan: PlanId;
};

export interface DocSummary {
  id: string;
  title: string;
  content: string;
  documentType: string;
  language: string;
  storyCanvas: Record<string, string>;
  updatedAt: string;
}

export const Api = {
  me: () => api<Me>("/me"),
  login: (email: string, password: string) => api<{ token: string }>("/auth/login", { body: { email, password } }),
  register: (email: string, password: string, name: string) =>
    api<{ token: string }>("/auth/register", { body: { email, password, name } }),
  updateMe: (patch: Record<string, unknown>) => api("/me", { method: "PATCH", body: patch }),
  check: (text: string, language: string, documentType: string, signal?: AbortSignal) =>
    api<CheckResponse>("/check", { body: { text, language, documentType }, signal }),
  rewrite: (text: string, mode: string, instruction?: string, language?: string) =>
    api<{ variants: string[]; explanation: string; creditsLeft: number | null }>("/ai/rewrite", {
      body: { text, mode, instruction, language },
    }),
  feedback: (text: string, documentType: string, language: string) =>
    api<Record<string, unknown>>("/ai/feedback", { body: { text, documentType, language } }),
  critique: (text: string, genre: string, language: string) =>
    api<Record<string, unknown>>("/ai/critique", { body: { text, genre, language } }),
  sparks: (text: string, kind: string, language: string) => api<{ ideas: string[] }>("/ai/sparks", { body: { text, kind, language } }),
  detect: (text: string) => api<Record<string, unknown>>("/ai/detect", { body: { text } }),
  synonyms: (word: string, context: string, language: string) =>
    api<{ synonyms: string[] }>("/ai/synonyms", { body: { word, context, language } }),
  thesaurus: (word: string) => api<{ synonyms: string[] }>(`/thesaurus?word=${encodeURIComponent(word)}`),
  plagiarism: (text: string) => api<{ scanId: string }>("/plagiarism", { body: { text } }),
  plagiarismStatus: (id: string) =>
    api<{ status: string; result: { score: number; matches: { url: string; title: string; matchedWords: number }[] } | null }>(
      `/plagiarism/${id}`,
    ),
  documents: () => api<{ documents: DocSummary[] }>("/documents"),
  document: (id: string) => api<DocSummary>(`/documents/${id}`),
  createDocument: (doc: Partial<DocSummary>) => api<DocSummary>("/documents", { body: doc }),
  saveDocument: (id: string, doc: Partial<DocSummary>) => api<DocSummary>(`/documents/${id}`, { method: "PUT", body: doc }),
  deleteDocument: (id: string) => api(`/documents/${id}`, { method: "DELETE" }),
  dictionary: () => api<{ words: string[] }>("/dictionary"),
  addWord: (word: string) => api("/dictionary", { body: { word } }),
  removeWord: (word: string) => api(`/dictionary/${encodeURIComponent(word)}`, { method: "DELETE" }),
  styleGuide: () => api<{ guide: StyleGuide | null }>("/styleguide"),
  saveStyleGuide: (guide: StyleGuide) => api("/styleguide", { method: "PUT", body: guide }),
  snippets: () => api<{ snippets: { id: string; shortcut: string; body: string }[] }>("/snippets"),
  addSnippet: (shortcut: string, body: string) => api("/snippets", { body: { shortcut, body } }),
  removeSnippet: (id: string) => api(`/snippets/${id}`, { method: "DELETE" }),
};

export type { Issue };
