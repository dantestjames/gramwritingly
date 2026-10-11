import { underlineColour, type Issue } from "@gramwritingly/core";

interface Props {
  issue: Issue;
  text: string;
  active: boolean;
  onFocus(): void;
  onAccept(replacement: string): void;
  onDismiss(): void;
  onAddToDictionary?(): void;
  onRewrite?(): void;
}

const CATEGORY_LABEL: Record<Issue["category"], string> = {
  spelling: "Spelling", grammar: "Grammar", punctuation: "Punctuation", style: "Style", readability: "Readability",
  clarity: "Clarity", consistency: "Consistency", inclusive: "Inclusive language", tone: "Tone", styleguide: "Style guide",
};

export function IssueCard({ issue, text, active, onFocus, onAccept, onDismiss, onAddToDictionary, onRewrite }: Props) {
  const original = text.slice(issue.offset, issue.offset + issue.length);
  const colour = issue.highlight ? `hl-${issue.highlight}` : `dot-${underlineColour(issue)}`;
  const isSentence = issue.highlight === "hard" || issue.highlight === "very-hard" || issue.length > 60;
  return (
    <article className={`card${active ? " card-active" : ""}`} onClick={onFocus} id={`issue-${issue.id}`}>
      <header className="card-head">
        <span className={`card-dot ${colour}`} aria-hidden="true" />
        <span className="card-kind">{issue.title ?? CATEGORY_LABEL[issue.category]}</span>
      </header>
      {active ? (
        <div className="card-body">
          {!isSentence && (
            <p className="card-fix">
              <s>{original || "(space)"}</s>
              {issue.replacements.slice(0, 3).map((r, n) => (
                <button
                  key={n}
                  className="chip chip-fix"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAccept(r);
                  }}
                >
                  {r === "" ? "Remove" : r}
                </button>
              ))}
            </p>
          )}
          <p className="card-msg">{issue.message}</p>
          <div className="card-actions">
            {isSentence && onRewrite && (
              <button className="btn btn-small btn-primary" onClick={(e) => { e.stopPropagation(); onRewrite(); }}>
                Rewrite with AI
              </button>
            )}
            {issue.category === "spelling" && onAddToDictionary && (
              <button className="btn btn-small" onClick={(e) => { e.stopPropagation(); onAddToDictionary(); }}>
                Add to dictionary
              </button>
            )}
            <button className="btn btn-small btn-quiet" onClick={(e) => { e.stopPropagation(); onDismiss(); }}>
              Dismiss
            </button>
          </div>
        </div>
      ) : (
        <p className="card-preview">
          {isSentence ? `“${original.slice(0, 70)}${original.length > 70 ? "…" : ""}”` : original}
          {issue.replacements[0] && !isSentence ? <span className="card-arrow"> → {issue.replacements[0] || "remove"}</span> : null}
        </p>
      )}
    </article>
  );
}
