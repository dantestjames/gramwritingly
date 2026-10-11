/**
 * Background worker. Content scripts can't call the API directly (page CORS rules), so every
 * network request goes through here. If the server is unreachable, checks fall back to the
 * offline core engine so style, readability and consistency still work.
 */
import { analyse, type Issue } from "@gramwritingly/core";
import { getSettings, saveSettings, type CheckReply, type Message, type Reply, type StatusReply } from "./shared";

class ApiFailure extends Error {
  constructor(message: string, public code = "error") {
    super(message);
  }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const s = await getSettings();
  let res: Response;
  try {
    res = await fetch(`${s.apiUrl}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(s.token ? { Authorization: `Bearer ${s.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ApiFailure("Can't reach the Gramwritingly server.", "offline");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  // An expired session clears the token; a wrong password on the sign-in form must not.
  if (res.status === 401 && s.token && !path.startsWith("/auth/")) await saveSettings({ token: null });
  if (!res.ok) throw new ApiFailure(data.message ?? `Request failed (${res.status})`, data.error);
  return data as T;
}

let snippetCache: { at: number; list: { shortcut: string; body: string }[] } | null = null;

async function handle(msg: Message): Promise<unknown> {
  const s = await getSettings();
  switch (msg.type) {
    case "check": {
      try {
        const r = await call<{ issues: Issue[]; plan: "free" | "pro" }>("/check", { text: msg.text, language: s.language });
        return { issues: r.issues, source: "server", plan: r.plan } satisfies CheckReply;
      } catch {
        const local = analyse(msg.text, { language: s.language, plan: "free" });
        return { issues: local.issues, source: "local", plan: "free" } satisfies CheckReply;
      }
    }
    case "rewrite":
      return call("/ai/rewrite", { text: msg.text, mode: msg.mode, language: s.language });
    case "synonyms":
      return s.token
        ? call("/ai/synonyms", { word: msg.word, context: msg.context, language: s.language }).catch(() =>
            call(`/thesaurus?word=${encodeURIComponent(msg.word)}`),
          )
        : call(`/thesaurus?word=${encodeURIComponent(msg.word)}`);
    case "addWord":
      return call("/dictionary", { word: msg.word });
    case "snippets": {
      if (!s.token) return [];
      if (snippetCache && Date.now() - snippetCache.at < 60_000) return snippetCache.list;
      try {
        const r = await call<{ snippets: { shortcut: string; body: string }[] }>("/snippets");
        snippetCache = { at: Date.now(), list: r.snippets };
        return r.snippets;
      } catch {
        return [];
      }
    }
    case "login": {
      const r = await call<{ token: string }>("/auth/login", { email: msg.email, password: msg.password });
      await saveSettings({ token: r.token });
      snippetCache = null;
      return true;
    }
    case "logout":
      await saveSettings({ token: null });
      snippetCache = null;
      return true;
    case "status": {
      const out: StatusReply = { settings: { ...s, token: s.token ? "set" : null }, signedIn: false, server: false };
      try {
        await call("/health");
        out.server = true;
        if (s.token) {
          const me = await call<{ user: { email: string }; plan: { name: string; limits: { aiCreditsPerMonth: number | null } }; usage: { aiCredits: number } }>("/me");
          Object.assign(out, {
            signedIn: true, email: me.user.email, plan: me.plan.name,
            aiCreditsUsed: me.usage.aiCredits, aiCreditsLimit: me.plan.limits.aiCreditsPerMonth,
          });
        }
      } catch {
        /* offline */
      }
      return out;
    }
  }
}

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  handle(msg)
    .then((data) => sendResponse({ ok: true, data } satisfies Reply<unknown>))
    .catch((err: ApiFailure) => sendResponse({ ok: false, error: err.message, code: err.code } satisfies Reply<unknown>));
  return true; // async response
});

// Right-click menu on selected text.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "gw-root", title: "Gramwritingly", contexts: ["selection", "editable"] });
    const items: [string, string][] = [
      ["fix", "Fix this"], ["shorten", "Shorten"], ["formal", "More formal"], ["friendly", "More friendly"],
      ["confident", "More confident"], ["simplify", "Plain English"],
    ];
    for (const [id, title] of items) {
      chrome.contextMenus.create({ id: `gw-${id}`, parentId: "gw-root", title, contexts: ["selection"] });
    }
    chrome.contextMenus.create({ id: "gw-open", parentId: "gw-root", title: "Open the full editor", contexts: ["selection", "editable"] });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const id = String(info.menuItemId);
  if (id === "gw-open") {
    const s = await getSettings();
    chrome.tabs.create({ url: s.webUrl });
    return;
  }
  if (!tab?.id || !id.startsWith("gw-")) return;
  chrome.tabs.sendMessage(tab.id, { type: "gw-rewrite-selection", mode: id.slice(3) }, { frameId: info.frameId ?? 0 });
});
