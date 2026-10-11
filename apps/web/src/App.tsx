import {
  applyFix, DOCUMENT_TYPES, issuesAt, type DocumentType, type Issue, type Language, type ReportId, type StyleGuide,
} from "@gramwritingly/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiPanel } from "./components/AiPanel";
import { Editor, type EditorHandle } from "./components/Editor";
import { IssueCard } from "./components/IssueCard";
import { AuthModal, SettingsModal, UpgradeModal } from "./components/Modals";
import { ReportsPanel } from "./components/ReportsPanel";
import { StatsPanel } from "./components/StatsPanel";
import { StoryCanvas } from "./components/StoryCanvas";
import { Api, ApiError, getToken, setToken, type DocSummary, type Me } from "./lib/api";
import { exportFile, importFile } from "./lib/files";
import { dismissKey, useAnalysis } from "./lib/useAnalysis";

const SAMPLE = `Welcome to Gramwritingly. Paste your own writing here, or play with this paragraph.

The new policy was implemented by management in order to utilise our resources more efficiently. It is very important that we really focus on the things that matter, and at the end of the day the team will collaborate together on the final outcome. Our organization will analyze the results in the near future and communicate them to all stakeholders through a comprehensive series of informative updates delivered at regular intervals throughout the year.

Their are a few spelling mistakes in this sentance too, so you can see how corrections look.`;

const LANGUAGES: { id: Language; label: string }[] = [
  { id: "en-AU", label: "English (Australia)" },
  { id: "en-GB", label: "English (UK)" },
  { id: "en-NZ", label: "English (New Zealand)" },
  { id: "en-US", label: "English (US)" },
  { id: "en-CA", label: "English (Canada)" },
  { id: "en-ZA", label: "English (South Africa)" },
];

type Tab = "suggestions" | "readability" | "reports" | "ai" | "story";

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem("gw.draft") ?? "null") as { title: string; text: string } | null;
  } catch {
    return null;
  }
}

export function App() {
  const draft = loadDraft();
  const [text, setText] = useState(draft?.text ?? SAMPLE);
  const [title, setTitle] = useState(draft?.title ?? "Untitled");
  const [docId, setDocId] = useState<string | null>(null);
  const [storyCanvas, setStoryCanvas] = useState<Record<string, string>>({});
  const [language, setLanguage] = useState<Language>("en-AU");
  const [documentType, setDocumentType] = useState<DocumentType>("general");
  const [mode, setMode] = useState<"edit" | "write">("edit");
  const [me, setMe] = useState<Me | null>(null);
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [dictionary, setDictionary] = useState<string[]>([]);
  const [styleGuide, setStyleGuide] = useState<StyleGuide | undefined>();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [tab, setTab] = useState<Tab>("suggestions");
  const [openReport, setOpenReport] = useState<ReportId | null>(null);
  const [focusReport, setFocusReport] = useState<ReportId | null>(null);
  const [modal, setModal] = useState<"auth" | "upgrade" | "settings" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [explorer, setExplorer] = useState<{ word: string; start: number; end: number; words: string[] | null } | null>(null);
  const editor = useRef<EditorHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const plan = me?.plan.id ?? "free";
  const isPro = plan === "pro";
  const signedIn = !!me;

  const { result, issues, counts, grammarStatus } = useAnalysis(text, {
    language, documentType, plan, dictionary, styleGuide, dismissed,
  });

  // Issues shown inline: everything, or one report's issues when a report is open.
  const shownIssues = useMemo(() => {
    if (!focusReport) return issues;
    const rep = result.reports[focusReport];
    return rep && !("locked" in rep) ? rep.issues.filter((i) => !dismissed.has(dismissKey(text, i))) : [];
  }, [focusReport, issues, result.reports, dismissed, text]);

  const cards = useMemo(
    () => issues.filter((i) => !(i.highlight && ["hard", "very-hard", "adverb", "passive", "weak", "simpler"].includes(i.highlight)) || i.id === activeId),
    [issues, activeId],
  );

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ---- Account ------------------------------------------------------------
  const refreshMe = useCallback(async () => {
    if (!getToken()) return setMe(null);
    try {
      const m = await Api.me();
      setMe(m);
      const s = m.user.settings;
      if (s.language) setLanguage(s.language as Language);
      if (s.documentType) setDocumentType(s.documentType as DocumentType);
      const [d, list] = await Promise.all([Api.dictionary(), Api.documents()]);
      setDictionary(d.words);
      setDocs(list.documents);
      if (m.plan.id === "pro") setStyleGuide((await Api.styleGuide()).guide ?? undefined);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setToken(null);
        setMe(null);
      }
    }
  }, []);
  useEffect(() => { refreshMe(); }, [refreshMe]);

  // ---- Persistence -------------------------------------------------------
  useEffect(() => {
    const h = setTimeout(async () => {
      if (docId && signedIn) {
        try {
          await Api.saveDocument(docId, { title, content: text, documentType, language, storyCanvas });
        } catch (err) {
          showToast((err as Error).message);
        }
      } else {
        try { localStorage.setItem("gw.draft", JSON.stringify({ title, text })); } catch { /* ignore */ }
      }
    }, 1200);
    return () => clearTimeout(h);
  }, [text, title, docId, signedIn, documentType, language, storyCanvas, showToast]);

  async function saveToAccount() {
    if (!signedIn) return setModal("auth");
    try {
      const doc = await Api.createDocument({ title, content: text, documentType, language, storyCanvas });
      setDocId(doc.id);
      setDocs((d) => [doc, ...d]);
      showToast("Saved to your documents.");
    } catch (err) {
      showToast((err as Error).message);
    }
  }

  async function openDoc(id: string) {
    const d = await Api.document(id);
    setDocId(d.id);
    setTitle(d.title);
    setText(d.content);
    setDocumentType(d.documentType as DocumentType);
    setLanguage(d.language as Language);
    setStoryCanvas(d.storyCanvas ?? {});
    setDismissed(new Set());
  }

  function newDoc() {
    setDocId(null);
    setTitle("Untitled");
    setText("");
    setStoryCanvas({});
    setDismissed(new Set());
    editor.current?.focus();
  }

  // ---- Editing actions ----------------------------------------------------
  function accept(issue: Issue, replacement: string) {
    const { text: next, start } = applyFix(text, issue, replacement);
    setText(next);
    setActiveId(null);
    requestAnimationFrame(() => editor.current?.select(start + replacement.length, start + replacement.length));
  }

  function replaceRange(start: number, end: number, value: string) {
    setText(text.slice(0, start) + value + text.slice(end));
    requestAnimationFrame(() => editor.current?.select(start, start + value.length));
  }

  function insertAtCursor(value: string) {
    const at = selection.end || text.length;
    const sep = at > 0 && !/\s$/.test(text.slice(0, at)) ? " " : "";
    replaceRange(at, at, sep + value);
  }

  function focusIssue(issue: Issue) {
    setActiveId(issue.id);
    editor.current?.select(issue.offset, issue.offset + issue.length);
    if (tab !== "suggestions" && tab !== "reports") setTab("suggestions");
    requestAnimationFrame(() => document.getElementById(`issue-${issue.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }

  async function addToDictionary(issue: Issue) {
    const word = text.slice(issue.offset, issue.offset + issue.length);
    setDictionary((d) => [...d, word]);
    setDismissed((s) => new Set(s).add(dismissKey(text, issue)));
    if (signedIn) Api.addWord(word).catch(() => undefined);
  }

  async function explore(word: string, start: number, end: number) {
    setExplorer({ word, start, end, words: null });
    setTab("suggestions");
    try {
      const context = text.slice(Math.max(0, start - 200), Math.min(text.length, end + 200));
      const r = isPro ? await Api.synonyms(word, context, language) : await Api.thesaurus(word);
      setExplorer({ word, start, end, words: r.synonyms });
    } catch {
      setExplorer({ word, start, end, words: [] });
    }
  }

  const setTabAndReport = (t: Tab) => {
    setTab(t);
    if (t !== "reports") {
      setOpenReport(null);
      setFocusReport(null);
    }
  };

  // ---- Render -----------------------------------------------------------
  return (
    <div className={`app mode-${mode}`}>
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 64 64" width="26" height="26" aria-hidden="true">
            <rect width="64" height="64" rx="14" fill="var(--pencil)" />
            <path d="M18 44 L40 14 L48 20 L26 50 L16 52 Z" fill="#fff" />
            <path d="M14 56 H50" stroke="var(--proof)" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <span>Gramwritingly</span>
        </div>
        <input className="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Document title" />
        <div className="toolbar">
          <select value={language} onChange={(e) => setLanguage(e.target.value as Language)} aria-label="Language">
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <select value={documentType} onChange={(e) => setDocumentType(e.target.value as DocumentType)} aria-label="Document type">
            {Object.entries(DOCUMENT_TYPES).map(([id, g]) => <option key={id} value={id}>{g.label}</option>)}
          </select>
          <div className="seg" role="group" aria-label="Mode">
            <button className={mode === "write" ? "on" : ""} onClick={() => setMode("write")} title="Hide highlights while drafting">Write</button>
            <button className={mode === "edit" ? "on" : ""} onClick={() => setMode("edit")} title="Show all highlights">Edit</button>
          </div>
          <details className="menu">
            <summary className="btn">File</summary>
            <div className="menu-pop">
              <button onClick={newDoc}>New document</button>
              {!docId && <button onClick={saveToAccount}>Save to my documents</button>}
              <button onClick={() => fileInput.current?.click()}>Import .docx, .txt, .md, .html</button>
              <hr />
              {(["docx", "txt", "md", "html"] as const).map((f) => (
                <button key={f} onClick={() => (f === "txt" || isPro ? exportFile(f, title, text) : setModal("upgrade"))}>
                  Export .{f} {f !== "txt" && !isPro && <span className="badge-pro">Pro</span>}
                </button>
              ))}
            </div>
          </details>
          <input ref={fileInput} type="file" hidden accept=".docx,.txt,.md,.html,.htm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (!isPro && f.name.toLowerCase().endsWith(".docx")) { setModal("upgrade"); return; }
              const r = await importFile(f);
              setTitle(r.title);
              setText(r.text);
              setDocId(null);
              e.target.value = "";
            }} />
          {me ? (
            <button className="btn" onClick={() => setModal("settings")}>{me.user.name || me.user.email.split("@")[0]}{isPro && <span className="badge-pro">Pro</span>}</button>
          ) : (
            <button className="btn btn-primary" onClick={() => setModal("auth")}>Sign in</button>
          )}
        </div>
      </header>

      <div className="workspace">
        {signedIn && (
          <nav className="doclist" aria-label="Your documents">
            <button className="btn btn-wide" onClick={newDoc}>New document</button>
            <ul>
              {docs.map((d) => (
                <li key={d.id}>
                  <button className={d.id === docId ? "doc on" : "doc"} onClick={() => openDoc(d.id)}>
                    <span>{d.title}</span>
                    <small>{new Date(d.updatedAt.replace(" ", "T") + "Z").toLocaleDateString("en-AU")}</small>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <main className="desk">
          <div className="page">
            <Editor
              ref={editor}
              text={text}
              onChange={setText}
              issues={mode === "write" ? [] : shownIssues}
              activeId={activeId}
              showReadability={mode === "edit"}
              showCorrections={mode === "edit"}
              onCaret={(pos) => {
                const hit = issuesAt(issues, pos).find((i) => !["hard", "very-hard"].includes(i.highlight ?? ""));
                setActiveId(hit?.id ?? null);
                if (hit) {
                  setTab("suggestions");
                  requestAnimationFrame(() => document.getElementById(`issue-${hit.id}`)?.scrollIntoView({ block: "nearest" }));
                }
              }}
              onSelect={setSelection}
              onWordDoubleClick={explore}
              placeholder="Start writing, or paste something in."
            />
          </div>
          <footer className="statusbar">
            <span>{result.stats.words.toLocaleString("en-AU")} words</span>
            <span>Grade {result.readability.grade}</span>
            <span className={`dot-status s-${grammarStatus}`}>
              {grammarStatus === "ok" ? "Grammar checked" : grammarStatus === "checking" ? "Checking…" : grammarStatus === "offline" ? "Offline: style checks only" : "Grammar service unavailable"}
            </span>
          </footer>
        </main>

        <aside className="margin" aria-label="Suggestions and tools">
          <div className="tabs" role="tablist">
            {(["suggestions", "readability", "reports", "ai", ...(documentType === "fiction" ? ["story"] : [])] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "tab tab-on" : "tab"} onClick={() => setTabAndReport(t)}>
                {t === "suggestions" ? `Suggestions ${cards.length ? cards.length : ""}` : t === "ai" ? "AI" : t[0]!.toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {tab === "suggestions" && (
            <div className="panel cards">
              {explorer && (
                <section className="explorer">
                  <div className="result-head">
                    <h3>Word explorer: {explorer.word}</h3>
                    <button className="link" onClick={() => setExplorer(null)}>Close</button>
                  </div>
                  {explorer.words === null ? <p className="muted">Looking up…</p> : explorer.words.length === 0 ? <p className="muted">No alternatives found.</p> : (
                    <div className="chips">
                      {explorer.words.map((w) => (
                        <button key={w} className="chip" onClick={() => { replaceRange(explorer.start, explorer.end, w); setExplorer(null); }}>{w}</button>
                      ))}
                    </div>
                  )}
                </section>
              )}
              {cards.length === 0 && <p className="empty">Nothing to fix right now. Nice work.</p>}
              {cards.map((i) => (
                <IssueCard
                  key={i.id}
                  issue={i}
                  text={text}
                  active={i.id === activeId}
                  onFocus={() => focusIssue(i)}
                  onAccept={(r) => accept(i, r)}
                  onDismiss={() => { setDismissed((s) => new Set(s).add(dismissKey(text, i))); setActiveId(null); }}
                  onAddToDictionary={() => addToDictionary(i)}
                  onRewrite={() => { editor.current?.select(i.offset, i.offset + i.length); setSelection({ start: i.offset, end: i.offset + i.length }); setTab("ai"); }}
                />
              ))}
            </div>
          )}
          {tab === "readability" && <StatsPanel result={result} counts={counts} />}
          {tab === "reports" && (
            <ReportsPanel
              result={result}
              text={text}
              isPro={isPro}
              openReport={openReport}
              onOpenReport={(id) => { setOpenReport(id); setFocusReport(id); }}
              onFocusIssue={(i) => { setActiveId(i.id); editor.current?.select(i.offset, i.offset + i.length); }}
              onUpgrade={() => setModal("upgrade")}
            />
          )}
          {tab === "ai" && (
            <AiPanel
              text={text}
              selection={selection}
              language={language}
              documentType={documentType}
              signedIn={signedIn}
              isPro={isPro}
              onReplace={replaceRange}
              onInsert={insertAtCursor}
              onNeedSignIn={() => setModal("auth")}
              onUpgrade={() => setModal("upgrade")}
              onToast={showToast}
            />
          )}
          {tab === "story" && <StoryCanvas value={storyCanvas} onChange={setStoryCanvas} />}
        </aside>
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
      {modal === "auth" && <AuthModal onClose={() => setModal(null)} onSignedIn={() => { setModal(null); refreshMe(); }} />}
      {modal === "upgrade" && <UpgradeModal onClose={() => setModal(null)} />}
      {modal === "settings" && me && (
        <SettingsModal
          me={me}
          onClose={() => setModal(null)}
          onChanged={refreshMe}
          onSignOut={() => { setToken(null); setMe(null); setDocs([]); setDocId(null); setStyleGuide(undefined); setDictionary([]); setModal(null); }}
        />
      )}
    </div>
  );
}
