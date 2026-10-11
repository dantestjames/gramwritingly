import { useState } from "react";
import { Api, ApiError } from "../lib/api";

interface Props {
  text: string;
  selection: { start: number; end: number };
  language: string;
  documentType: string;
  signedIn: boolean;
  isPro: boolean;
  onReplace(start: number, end: number, value: string, expected?: string): void;
  onInsert(value: string): void;
  onNeedSignIn(): void;
  onUpgrade(): void;
  onToast(msg: string): void;
}

const TONE_TOOLS: { mode: string; label: string; pro: boolean }[] = [
  { mode: "fix", label: "Fix it", pro: false },
  { mode: "shorten", label: "Shorten", pro: true },
  { mode: "detail", label: "Add detail", pro: true },
  { mode: "confident", label: "More confident", pro: true },
  { mode: "friendly", label: "More friendly", pro: true },
  { mode: "casual", label: "More casual", pro: true },
  { mode: "formal", label: "More formal", pro: true },
  { mode: "persuasive", label: "More persuasive", pro: true },
  { mode: "fluency", label: "Sound fluent", pro: true },
  { mode: "simplify", label: "Plain English", pro: true },
];

const SPARKS = [
  { kind: "continue", label: "Keep going" },
  { kind: "describe", label: "Describe" },
  { kind: "dialogue", label: "Dialogue" },
  { kind: "brainstorm", label: "Brainstorm" },
  { kind: "headline", label: "Headlines" },
  { kind: "example", label: "Examples" },
];

type Result =
  | { kind: "variants"; start: number; end: number; original: string; variants: string[]; explanation: string }
  | { kind: "ideas"; ideas: string[] }
  | { kind: "json"; title: string; data: Record<string, unknown> }
  | { kind: "plagiarism"; score: number; matches: { url: string; title: string; matchedWords: number }[] };

export function AiPanel(p: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [custom, setCustom] = useState("");

  const selected = p.text.slice(p.selection.start, p.selection.end);
  const hasSelection = selected.trim().length > 0;

  async function run<T>(key: string, fn: () => Promise<T>, done: (r: T) => void) {
    if (!p.signedIn) return p.onNeedSignIn();
    setBusy(key);
    try {
      done(await fn());
    } catch (err) {
      if (err instanceof ApiError && err.code === "pro_required") p.onUpgrade();
      else p.onToast((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function rewrite(mode: string, instruction?: string) {
    const { start, end } = hasSelection ? p.selection : paragraphAround(p.text, p.selection.start);
    const chunk = p.text.slice(start, end);
    if (!chunk.trim()) return p.onToast("Select some text first, or put your cursor in a paragraph.");
    run(mode, () => Api.rewrite(chunk, mode, instruction, p.language), (r) =>
      setResult({ kind: "variants", start, end, original: chunk, variants: r.variants, explanation: r.explanation }),
    );
  }

  return (
    <div className="panel ai">
      <section>
        <h3>Rewrite</h3>
        <p className="muted">
          {hasSelection ? `${selected.split(/\s+/).length} words selected.` : "Works on the selected text, or the paragraph your cursor is in."} One credit per sentence.
        </p>
        <div className="chips">
          {TONE_TOOLS.map((t) => (
            <button key={t.mode} className="chip" disabled={!!busy} onClick={() => (t.pro && !p.isPro ? p.onUpgrade() : rewrite(t.mode))}>
              {busy === t.mode ? "Working…" : t.label}
              {t.pro && !p.isPro && <span className="badge-pro">Pro</span>}
            </button>
          ))}
        </div>
        <form
          className="ask"
          onSubmit={(e) => {
            e.preventDefault();
            if (!p.isPro) return p.onUpgrade();
            if (custom.trim()) rewrite("custom", custom.trim());
          }}
        >
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Ask for anything: change to past tense, remove jargon…"
            aria-label="Custom rewrite instruction"
          />
          <button className="btn btn-primary" disabled={!!busy}>Go</button>
        </form>
      </section>

      {result && <ResultView result={result} p={p} onClose={() => setResult(null)} />}

      <section>
        <h3>Sparks</h3>
        <p className="muted">Stuck? Get ideas based on the last part of your document.</p>
        <div className="chips">
          {SPARKS.map((s) => (
            <button key={s.kind} className="chip" disabled={!!busy}
              onClick={() => run(s.kind, () => Api.sparks(p.text.slice(0, p.selection.end || undefined), s.kind, p.language), (r) => setResult({ kind: "ideas", ideas: r.ideas }))}>
              {busy === s.kind ? "Thinking…" : s.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Review the whole document</h3>
        <div className="stack">
          <ProButton label="Editor feedback" busy={busy === "feedback"} isPro={p.isPro} onUpgrade={p.onUpgrade}
            onClick={() => run("feedback", () => Api.feedback(p.text, p.documentType, p.language), (data) => setResult({ kind: "json", title: "Editor feedback", data }))} />
          <ProButton label="Chapter critique" busy={busy === "critique"} isPro={p.isPro} onUpgrade={p.onUpgrade}
            onClick={() => run("critique", () => Api.critique(p.text, "", p.language), (data) => setResult({ kind: "json", title: "Chapter critique", data }))} />
          <ProButton label="Check for AI-generated text" busy={busy === "detect"} isPro={p.isPro} onUpgrade={p.onUpgrade}
            onClick={() => run("detect", () => Api.detect(p.text), (data) => setResult({ kind: "json", title: "AI detection", data }))} />
          <ProButton label="Check for plagiarism" busy={busy === "plagiarism"} isPro={p.isPro} onUpgrade={p.onUpgrade}
            onClick={() =>
              run("plagiarism", async () => {
                const { scanId } = await Api.plagiarism(p.text);
                for (let n = 0; n < 40; n++) {
                  await new Promise((r) => setTimeout(r, 3000));
                  const s = await Api.plagiarismStatus(scanId);
                  if (s.status === "completed" && s.result) return s.result;
                  if (s.status === "error") throw new Error("The plagiarism scan failed. Try again later.");
                }
                throw new Error("The scan is taking a while. Check back in a few minutes.");
              }, (r) => setResult({ kind: "plagiarism", score: r.score, matches: r.matches }))
            } />
        </div>
      </section>
    </div>
  );
}

function ProButton({ label, busy, isPro, onClick, onUpgrade }: { label: string; busy: boolean; isPro: boolean; onClick(): void; onUpgrade(): void }) {
  return (
    <button className="btn btn-wide" disabled={busy} onClick={() => (isPro ? onClick() : onUpgrade())}>
      {busy ? "Working…" : label} {!isPro && <span className="badge-pro">Pro</span>}
    </button>
  );
}

function ResultView({ result, p, onClose }: { result: Result; p: Props; onClose(): void }) {
  return (
    <section className="result" aria-live="polite">
      <div className="result-head">
        <h3>{result.kind === "variants" ? "Suggestions" : result.kind === "ideas" ? "Ideas" : result.kind === "plagiarism" ? "Plagiarism" : result.title}</h3>
        <button className="link" onClick={onClose} aria-label="Close">Close</button>
      </div>
      {result.kind === "variants" && (
        <>
          {result.explanation && <p className="muted">{result.explanation}</p>}
          {result.variants.map((v, i) => (
            <div className="variant" key={i}>
              <p>{v}</p>
              <button className="btn btn-small btn-primary" onClick={() => { p.onReplace(result.start, result.end, v, result.original); onClose(); }}>Use this</button>
            </div>
          ))}
        </>
      )}
      {result.kind === "ideas" && (
        <ul className="ideas">
          {result.ideas.map((idea, i) => (
            <li key={i}>
              <p>{idea}</p>
              <button className="btn btn-small" onClick={() => p.onInsert(idea)}>Insert</button>
            </li>
          ))}
        </ul>
      )}
      {result.kind === "plagiarism" && (
        <>
          <p><b>{result.score}%</b> of your text matches other sources.</p>
          <ul className="matches">
            {result.matches.map((m) => (
              <li key={m.url}><a href={m.url} target="_blank" rel="noreferrer">{m.title || m.url}</a> <span className="muted">{m.matchedWords} words</span></li>
            ))}
          </ul>
        </>
      )}
      {result.kind === "json" && <JsonReport data={result.data} />}
    </section>
  );
}

/** Renders the structured feedback objects returned by the AI routes. */
function JsonReport({ data }: { data: unknown }): React.ReactElement {
  if (data === null || data === undefined) return <></>;
  if (typeof data !== "object") return <p>{String(data)}</p>;
  if (Array.isArray(data)) {
    return <ul>{data.map((d, i) => <li key={i}><JsonReport data={d} /></li>)}</ul>;
  }
  return (
    <div className="json">
      {Object.entries(data as Record<string, unknown>).map(([k, v]) => (
        <div key={k}>
          {typeof v === "object" ? <h4>{label(k)}</h4> : <b>{label(k)}: </b>}
          <JsonReport data={v} />
        </div>
      ))}
    </div>
  );
}

const label = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

function paragraphAround(text: string, pos: number) {
  const start = text.lastIndexOf("\n", Math.max(0, pos - 1)) + 1;
  const nl = text.indexOf("\n", pos);
  return { start, end: nl === -1 ? text.length : nl };
}
