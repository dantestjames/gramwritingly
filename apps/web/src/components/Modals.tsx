import type { StyleGuide } from "@gramwritingly/core";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Api, setToken, type Me } from "../lib/api";

export function Modal({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} onCancel={onClose}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="link" onClick={onClose} aria-label="Close">Close</button>
      </div>
      {children}
    </dialog>
  );
}

export function AuthModal({ onClose, onSignedIn }: { onClose(): void; onSignedIn(): void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { token } = mode === "login" ? await Api.login(email, password) : await Api.register(email, password, name);
      setToken(token);
      onSignedIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={mode === "login" ? "Sign in" : "Create your account"} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {mode === "register" && (
          <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        )}
        <label className="field"><span>Email</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label className="field">
          <span>Password</span>
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}</button>
        <button type="button" className="link" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "New here? Create a free account" : "Already have an account? Sign in"}
        </button>
      </form>
    </Modal>
  );
}

export function UpgradeModal({ onClose }: { onClose(): void }) {
  return (
    <Modal title="Gramwritingly Pro" onClose={onClose}>
      <div className="upgrade">
        <ul className="ticks">
          <li>Every report, on documents of any length</li>
          <li>Tone tools, fluency and custom AI requests</li>
          <li>5,000 AI sentence rewrites a month</li>
          <li>Editor feedback and 30 chapter critiques a day</li>
          <li>Plagiarism and AI-text checks</li>
          <li>Your own style guide, brand tone and snippets</li>
          <li>Author comparison and inclusive-language checks</li>
        </ul>
        <p className="muted">Online payments are coming soon. Ask your administrator to switch your account to Pro.</p>
        <button className="btn btn-primary" onClick={onClose}>Got it</button>
      </div>
    </Modal>
  );
}

export function SettingsModal({ me, onClose, onChanged, onSignOut }: { me: Me; onClose(): void; onChanged(): void; onSignOut(): void }) {
  const isPro = me.plan.id === "pro";
  const [tab, setTab] = useState<"writing" | "dictionary" | "style" | "snippets">("writing");
  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="tabs" role="tablist">
        {(["writing", "dictionary", "style", "snippets"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "tab tab-on" : "tab"} onClick={() => setTab(t)}>
            {t === "style" ? "Style guide" : t[0]!.toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === "writing" && <WritingSettings me={me} onChanged={onChanged} onSignOut={onSignOut} />}
      {tab === "dictionary" && <DictionarySettings onChanged={onChanged} />}
      {tab === "style" && (isPro ? <StyleGuideSettings onChanged={onChanged} /> : <p>Style guides and brand tone are part of Pro.</p>)}
      {tab === "snippets" && (isPro ? <SnippetSettings /> : <p>Snippets are part of Pro.</p>)}
    </Modal>
  );
}

function WritingSettings({ me, onChanged, onSignOut }: { me: Me; onChanged(): void; onSignOut(): void }) {
  const [voice, setVoice] = useState(String(me.user.settings.voiceSample ?? ""));
  const [saved, setSaved] = useState(false);
  return (
    <form className="form" onSubmit={async (e) => { e.preventDefault(); await Api.updateMe({ voiceSample: voice }); setSaved(true); onChanged(); }}>
      <label className="field">
        <span>Your voice</span>
        <textarea rows={6} value={voice} onChange={(e) => { setVoice(e.target.value); setSaved(false); }}
          placeholder="Paste a few paragraphs you wrote and like. AI rewrites will match your tone and word choice." />
      </label>
      <button className="btn btn-primary">{saved ? "Saved" : "Save"}</button>
      <hr />
      <p className="muted">Signed in as {me.user.email}. Plan: {me.plan.name}. AI credits used this month: {me.usage.aiCredits} of {me.plan.limits.aiCreditsPerMonth ?? "unlimited"}.</p>
      <button type="button" className="btn" onClick={onSignOut}>Sign out</button>
    </form>
  );
}

function DictionarySettings({ onChanged }: { onChanged(): void }) {
  const [words, setWords] = useState<string[]>([]);
  const [word, setWord] = useState("");
  const load = () => Api.dictionary().then((r) => setWords(r.words));
  useEffect(() => { load(); }, []);
  return (
    <div className="form">
      <form className="ask" onSubmit={async (e) => { e.preventDefault(); if (!word.trim()) return; await Api.addWord(word.trim()); setWord(""); await load(); onChanged(); }}>
        <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="Add a word, name or brand" aria-label="Word" />
        <button className="btn btn-primary">Add</button>
      </form>
      <ul className="pill-list">
        {words.map((w) => (
          <li key={w}>{w} <button className="link" aria-label={`Remove ${w}`} onClick={async () => { await Api.removeWord(w); await load(); onChanged(); }}>×</button></li>
        ))}
      </ul>
    </div>
  );
}

function StyleGuideSettings({ onChanged }: { onChanged(): void }) {
  const [guide, setGuide] = useState<StyleGuide>({ name: "House style", rules: [] });
  const [saved, setSaved] = useState(false);
  useEffect(() => { Api.styleGuide().then((r) => r.guide && setGuide(r.guide)); }, []);
  const update = (i: number, key: "term" | "replacement" | "note", v: string) => {
    setSaved(false);
    setGuide((g) => ({ ...g, rules: g.rules.map((r, n) => (n === i ? { ...r, [key]: v } : r)) }));
  };
  return (
    <form className="form" onSubmit={async (e) => { e.preventDefault(); await Api.saveStyleGuide({ ...guide, rules: guide.rules.filter((r) => r.term.trim()) }); setSaved(true); onChanged(); }}>
      <label className="field"><span>Guide name</span><input value={guide.name} onChange={(e) => setGuide({ ...guide, name: e.target.value })} /></label>
      <label className="field">
        <span>Brand tone</span>
        <select multiple value={guide.brandTones ?? []} onChange={(e) => setGuide({ ...guide, brandTones: [...e.target.selectedOptions].map((o) => o.value as never) })}>
          {["confident", "friendly", "formal", "casual", "positive", "urgent"].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <table className="rules">
        <thead><tr><th>Instead of</th><th>Use</th><th>Why</th><th /></tr></thead>
        <tbody>
          {guide.rules.map((r, i) => (
            <tr key={i}>
              <td><input value={r.term} onChange={(e) => update(i, "term", e.target.value)} aria-label="Term" /></td>
              <td><input value={r.replacement ?? ""} onChange={(e) => update(i, "replacement", e.target.value)} aria-label="Replacement" placeholder="(avoid)" /></td>
              <td><input value={r.note ?? ""} onChange={(e) => update(i, "note", e.target.value)} aria-label="Note" /></td>
              <td><button type="button" className="link" onClick={() => setGuide({ ...guide, rules: guide.rules.filter((_, n) => n !== i) })}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn" onClick={() => setGuide({ ...guide, rules: [...guide.rules, { term: "", replacement: "" }] })}>Add rule</button>
      <button className="btn btn-primary">{saved ? "Saved" : "Save style guide"}</button>
    </form>
  );
}

function SnippetSettings() {
  const [list, setList] = useState<{ id: string; shortcut: string; body: string }[]>([]);
  const [shortcut, setShortcut] = useState(";");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const load = () => Api.snippets().then((r) => setList(r.snippets));
  useEffect(() => { load(); }, []);
  return (
    <div className="form">
      <p className="muted">Type the shortcut in any text box (with the browser extension) and it expands into the full text.</p>
      <form className="form" onSubmit={async (e) => {
        e.preventDefault();
        try { await Api.addSnippet(shortcut, body); setShortcut(";"); setBody(""); setError(""); await load(); } catch (err) { setError((err as Error).message); }
      }}>
        <label className="field"><span>Shortcut</span><input value={shortcut} onChange={(e) => setShortcut(e.target.value)} /></label>
        <label className="field"><span>Expands to</span><textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} /></label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary">Add snippet</button>
      </form>
      <ul className="snippets">
        {list.map((s) => (
          <li key={s.id}><code>{s.shortcut}</code> <span>{s.body.slice(0, 80)}</span> <button className="link" onClick={async () => { await Api.removeSnippet(s.id); await load(); }}>Delete</button></li>
        ))}
      </ul>
    </div>
  );
}
