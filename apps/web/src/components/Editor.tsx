import { buildSegments, underlineColour, type Issue } from "@gramwritingly/core";
import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef } from "react";

export interface EditorHandle {
  focus(): void;
  select(start: number, end: number): void;
  selection(): { start: number; end: number; text: string };
}

interface Props {
  text: string;
  onChange(text: string): void;
  issues: Issue[];
  activeId: string | null;
  showReadability: boolean;
  showCorrections: boolean;
  onCaret(pos: number): void;
  onSelect(sel: { start: number; end: number }): void;
  onWordDoubleClick(word: string, start: number, end: number): void;
  placeholder?: string;
}

/**
 * A plain textarea with a mirrored overlay behind it. The overlay renders the same text with
 * highlight spans, so typing stays native (undo, IME, spellcheck-off, accessibility) while we
 * paint underlines and Hemingway colours underneath.
 */
export const Editor = forwardRef<EditorHandle, Props>(function Editor(props, ref) {
  const area = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => area.current?.focus(),
    select(start, end) {
      const el = area.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(start, end);
    },
    selection() {
      const el = area.current;
      if (!el) return { start: 0, end: 0, text: "" };
      return { start: el.selectionStart, end: el.selectionEnd, text: el.value.slice(el.selectionStart, el.selectionEnd) };
    },
  }));

  const segments = useMemo(
    () => buildSegments(props.text, props.issues, { readability: props.showReadability, corrections: props.showCorrections }),
    [props.text, props.issues, props.showReadability, props.showCorrections],
  );

  // Grow the textarea with its content so the page scrolls, not the box.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 480)}px`;
  }, [props.text]);

  return (
    <div className="editor">
      <div className="editor-mirror" ref={mirror} aria-hidden="true">
        {segments.map((s) => {
          const u = s.underline[0];
          const classes = [
            s.sentence ? `hl-${s.sentence}` : "",
            s.word ? `hl-${s.word}` : "",
            u ? `ul ul-${underlineColour(u)}` : "",
            u && props.activeId && s.underline.some((i) => i.id === props.activeId) ? "ul-active" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const chunk = props.text.slice(s.start, s.end);
          return classes ? (
            <span key={`${s.start}-${s.end}`} className={classes}>
              {chunk}
            </span>
          ) : (
            chunk
          );
        })}
        {/* Trailing newline needs a character to keep heights equal */}
        {"​"}
      </div>
      <textarea
        ref={area}
        className="editor-input"
        value={props.text}
        spellCheck={false}
        placeholder={props.placeholder}
        aria-label="Document text"
        onChange={(e) => props.onChange(e.target.value)}
        onClick={(e) => props.onCaret((e.target as HTMLTextAreaElement).selectionStart)}
        onKeyUp={(e) => {
          const el = e.target as HTMLTextAreaElement;
          if (el.selectionStart === el.selectionEnd) props.onCaret(el.selectionStart);
        }}
        onSelect={(e) => {
          const el = e.target as HTMLTextAreaElement;
          props.onSelect({ start: el.selectionStart, end: el.selectionEnd });
        }}
        onDoubleClick={(e) => {
          const el = e.target as HTMLTextAreaElement;
          const word = el.value.slice(el.selectionStart, el.selectionEnd).trim();
          if (/^[\p{L}'’-]+$/u.test(word)) props.onWordDoubleClick(word, el.selectionStart, el.selectionEnd);
        }}
      />
    </div>
  );
});
