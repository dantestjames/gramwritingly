import { TONE_LABELS, type AnalysisResult } from "@gramwritingly/core";

interface Props {
  result: AnalysisResult;
  counts: { correctness: number; clarity: number; style: number };
}

export function StatsPanel({ result, counts }: Props) {
  const { stats, readability: r, tone, goals } = result;
  const hem = result.reports.hemingway;
  const hm = hem && !("locked" in hem) ? hem.metrics : undefined;
  const sentences = Number(hm?.sentences ?? stats.sentences);
  const adverbTarget = Math.max(1, Math.round(sentences / 10));
  const passiveTarget = Math.max(1, Math.round(sentences / 5));

  return (
    <div className="panel stats">
      <section className="grade">
        <div className={`grade-num grade-${r.gradeLabel.toLowerCase().replace(/\s/g, "-")}`}>{stats.words ? r.grade : "–"}</div>
        <div>
          <div className="grade-label">{stats.words ? `Grade ${r.grade}, ${r.gradeLabel.toLowerCase()}` : "No text yet"}</div>
          <div className="muted">Flesch reading ease {r.fleschReadingEase}. Aim for grade 9 or lower for most readers.</div>
        </div>
      </section>

      <section className="score-row" aria-label="Issue counts">
        <div><b>{counts.correctness}</b><span>Correctness</span></div>
        <div><b>{counts.clarity}</b><span>Clarity</span></div>
        <div><b>{counts.style}</b><span>Style</span></div>
        <div><b>{result.score}</b><span>Score</span></div>
      </section>

      {hm && (
        <section className="hem-list" aria-label="Readability highlights">
          <HemRow kind="very-hard" n={Number(hm.veryHard)} label={`of ${sentences} sentences are very hard to read`} />
          <HemRow kind="hard" n={Number(hm.hard)} label={`of ${sentences} sentences are hard to read`} />
          <HemRow kind="simpler" n={Number(hm.simpler)} label="phrases have simpler alternatives" />
          <HemRow kind="adverb" n={Number(hm.adverbs)} label={`adverbs. Aim for ${adverbTarget} or fewer`} warn={Number(hm.adverbs) > adverbTarget} />
          <HemRow kind="passive" n={Number(hm.passive)} label={`uses of passive voice. Aim for ${passiveTarget} or fewer`} warn={Number(hm.passive) > passiveTarget} />
          <HemRow kind="weak" n={Number(hm.qualifiers)} label="weakening phrases" />
        </section>
      )}

      {tone.length > 0 && (
        <section>
          <h3>How it sounds</h3>
          <div className="tones">
            {tone.slice(0, 4).map((t) => (
              <span className="tone" key={t.key} title={`${Math.round(t.score * 100)}%`}>
                <span aria-hidden="true">{TONE_LABELS[t.key].emoji}</span> {TONE_LABELS[t.key].label}
              </span>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3>Goals for {result.documentType} writing</h3>
        <ul className="goals">
          {goals.map((g) => (
            <li key={g.label} className={g.met ? "met" : "miss"}>
              <span>{g.label}</span>
              <span>
                {g.value}
                {g.unit === "%" ? "%" : ""} <span className="muted">/ {g.target}{g.unit === "%" ? "%" : ""}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Counts</h3>
        <dl className="kv">
          <dt>Words</dt><dd>{stats.words.toLocaleString("en-AU")}</dd>
          <dt>Sentences</dt><dd>{stats.sentences}</dd>
          <dt>Paragraphs</dt><dd>{stats.paragraphs}</dd>
          <dt>Characters</dt><dd>{stats.characters.toLocaleString("en-AU")}</dd>
          <dt>Letters</dt><dd>{stats.letters.toLocaleString("en-AU")}</dd>
          <dt>Reading time</dt><dd>{fmtMinutes(stats.readingTimeMinutes)}</dd>
          <dt>Speaking time</dt><dd>{fmtMinutes(stats.speakingTimeMinutes)}</dd>
          <dt>Avg sentence</dt><dd>{stats.avgWordsPerSentence} words</dd>
        </dl>
      </section>
    </div>
  );
}

function HemRow({ kind, n, label, warn }: { kind: string; n: number; label: string; warn?: boolean }) {
  return (
    <div className={`hem-row hl-${kind}${warn ? " hem-warn" : ""}`}>
      <b>{n}</b> <span>{label}</span>
    </div>
  );
}

function fmtMinutes(m: number) {
  if (m < 1) return `${Math.max(1, Math.round(m * 60))} sec`;
  return `${Math.round(m)} min`;
}
