import {
  compareProfiles, PRESET_PROFILES, profileText, REPORT_TITLES, type AnalysisResult, type Issue, type ReportId,
  type ReportResult, type WritingProfile,
} from "@gramwritingly/core";
import { useMemo, useState } from "react";

interface Props {
  result: AnalysisResult;
  text: string;
  isPro: boolean;
  openReport: ReportId | null;
  onOpenReport(id: ReportId | null): void;
  onFocusIssue(issue: Issue): void;
  onUpgrade(): void;
}

const ORDER: ReportId[] = [
  "readability", "hemingway", "sticky", "overused", "repeats", "echoes", "cliches", "redundancies", "sentence-length",
  "sentence-starts", "consistency", "passive", "adverbs", "hidden-verbs", "vague", "simpler-words", "jargon",
  "show-dont-tell", "dialogue", "pacing", "sensory", "pronouns", "transitions", "inclusive", "acronyms", "citations",
  "homonyms", "style",
];

export function ReportsPanel({ result, text, isPro, openReport, onOpenReport, onFocusIssue, onUpgrade }: Props) {
  const [compare, setCompare] = useState(false);

  if (compare) return <AuthorCompare text={text} isPro={isPro} onBack={() => setCompare(false)} onUpgrade={onUpgrade} />;

  if (openReport) {
    const rep = result.reports[openReport];
    if (rep && !("locked" in rep)) return <ReportDetail rep={rep} text={text} onBack={() => onOpenReport(null)} onFocusIssue={onFocusIssue} />;
  }

  return (
    <div className="panel">
      {result.truncated && (
        <p className="notice">
          Free reports cover the first 1,000 words. Spelling and grammar still check everything. <button className="link" onClick={onUpgrade}>Go Pro</button> for full-length reports.
        </p>
      )}
      <ul className="report-list">
        {ORDER.map((id) => {
          const rep = result.reports[id];
          if (!rep) return null;
          const locked = "locked" in rep;
          return (
            <li key={id}>
              <button className="report-row" onClick={() => (locked ? onUpgrade() : onOpenReport(id))}>
                <span className="report-name">{REPORT_TITLES[id]}</span>
                {locked ? (
                  <span className="badge-pro">Pro</span>
                ) : (
                  <span className="report-meta">
                    {typeof rep.score === "number" && <Meter value={rep.score} />}
                    <span className="muted">{rep.issues.length || ""}</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <button className="btn btn-wide" onClick={() => setCompare(true)}>
        Compare with an author {!isPro && <span className="badge-pro">Pro</span>}
      </button>
    </div>
  );
}

function Meter({ value }: { value: number }) {
  return (
    <span className="meter" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} title={`${value}/100`}>
      <span style={{ width: `${value}%` }} className={value >= 80 ? "good" : value >= 55 ? "ok" : "poor"} />
    </span>
  );
}

function ReportDetail({ rep, text, onBack, onFocusIssue }: { rep: ReportResult; text: string; onBack(): void; onFocusIssue(i: Issue): void }) {
  const metrics = Object.entries(rep.metrics).filter(([, v]) => v !== "" && v !== undefined);
  return (
    <div className="panel">
      <button className="link back" onClick={onBack}>‹ All reports</button>
      <h2 className="report-title">{rep.title}</h2>
      <p>{rep.summary}</p>
      {metrics.length > 0 && (
        <dl className="kv">
          {metrics.slice(0, 12).map(([k, v]) => (
            <div key={k} className="kv-pair">
              <dt>{humanise(k)}</dt>
              <dd>{typeof v === "number" ? Math.round(v * 10) / 10 : v}</dd>
            </div>
          ))}
        </dl>
      )}
      <ul className="report-issues">
        {rep.issues.slice(0, 200).map((i) => (
          <li key={i.id}>
            <button className="report-issue" onClick={() => onFocusIssue(i)}>
              <q>{excerpt(text, i)}</q>
              <span className="muted">{i.message}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AuthorCompare({ text, isPro, onBack, onUpgrade }: { text: string; isPro: boolean; onBack(): void; onUpgrade(): void }) {
  const [sample, setSample] = useState("");
  const [sampleName, setSampleName] = useState("");
  const [presetIdx, setPresetIdx] = useState(0);
  const mine = useMemo(() => profileText(text), [text]);
  const theirs: WritingProfile = useMemo(
    () => (sample.trim().split(/\s+/).length > 50 ? profileText(sample, sampleName || "Author sample") : PRESET_PROFILES[presetIdx]!),
    [sample, sampleName, presetIdx],
  );
  if (!isPro) {
    return (
      <div className="panel">
        <button className="link back" onClick={onBack}>‹ All reports</button>
        <h2 className="report-title">Author comparison</h2>
        <p>See how your sentence length, adverbs, passive voice, dialogue and readability stack up against a genre or an author you admire.</p>
        <button className="btn btn-primary" onClick={onUpgrade}>Unlock with Pro</button>
      </div>
    );
  }
  const diffs = compareProfiles(mine, theirs);
  return (
    <div className="panel">
      <button className="link back" onClick={onBack}>‹ All reports</button>
      <h2 className="report-title">Author comparison</h2>
      <label className="field">
        <span>Compare with</span>
        <select value={presetIdx} onChange={(e) => { setPresetIdx(Number(e.target.value)); setSample(""); }}>
          {PRESET_PROFILES.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
        </select>
      </label>
      <details>
        <summary>Or paste a sample from any author</summary>
        <p className="muted">Paste 300+ words from a book you own. It is measured in your browser and never uploaded.</p>
        <input placeholder="Author name" value={sampleName} onChange={(e) => setSampleName(e.target.value)} />
        <textarea rows={5} value={sample} onChange={(e) => setSample(e.target.value)} />
      </details>
      {theirs.indicative && <p className="muted">Genre profiles are indicative targets, not measurements of real authors.</p>}
      <table className="compare">
        <thead><tr><th>Measure</th><th>You</th><th>{theirs.name.replace(" (indicative)", "")}</th></tr></thead>
        <tbody>
          {diffs.map((d) => (
            <tr key={d.metric}>
              <td>{d.label}</td>
              <td>{d.yours}</td>
              <td>{d.theirs} <span className={Math.abs(d.delta) > 25 ? "delta-far" : "delta-near"}>{d.delta > 0 ? "+" : ""}{d.delta}%</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function excerpt(text: string, i: Issue) {
  const s = text.slice(i.offset, i.offset + i.length);
  return s.length > 90 ? `${s.slice(0, 87)}…` : s;
}

function humanise(k: string) {
  return k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}
