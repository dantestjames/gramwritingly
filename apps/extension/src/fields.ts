/**
 * Uniform access to the two kinds of editable fields on the web:
 *  - <textarea> and text <input>: measured with an invisible mirror element
 *  - contenteditable regions (Gmail, Notion, Slack, LinkedIn, WordPress…): measured with DOM Ranges
 */

export interface TextField {
  el: HTMLElement;
  getText(): string;
  /** Viewport rectangles covering text[start, end). */
  rects(start: number, end: number): DOMRect[];
  /** Replace text[start, end) in a way the host page notices (keeps undo where possible). */
  replace(start: number, end: number, value: string): void;
  /** Current selection as text offsets. */
  selection(): { start: number; end: number } | null;
  destroy(): void;
}

const SKIP_INPUT_TYPES = new Set(["password", "email", "number", "tel", "url", "date", "time", "datetime-local", "month", "week", "color", "range", "hidden", "file", "checkbox", "radio", "submit", "button", "reset", "image"]);

/** Should we attach to this element at all? */
export function isCheckable(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest("[data-gramwritingly='false'], [data-gramm='false'], [data-enable-grammarly='false']")) return false;
  if ((el as HTMLInputElement).readOnly || (el as HTMLInputElement).disabled) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    if (SKIP_INPUT_TYPES.has(el.type)) return false;
    const ac = (el.autocomplete || "").toLowerCase();
    if (/(cc-|password|one-time-code|username)/.test(ac)) return false;
    return el.type === "text" || el.type === "search" || el.type === "";
  }
  return el.isContentEditable && el === editableRoot(el);
}

/** The outermost contenteditable ancestor (editors nest editable children). */
export function editableRoot(el: HTMLElement): HTMLElement {
  let root = el;
  while (root.parentElement && root.parentElement.isContentEditable) root = root.parentElement;
  return root;
}

export function createField(el: HTMLElement): TextField {
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? new PlainField(el) : new RichField(el);
}

/** Inserts text so frameworks (React, Vue) and undo history see a normal edit. */
function insertText(value: string) {
  // execCommand is deprecated on paper but remains the only way to edit like a user in every browser.
  return document.execCommand("insertText", false, value);
}

// ---------------------------------------------------------------------------

const COPY_STYLES = [
  "boxSizing", "width", "height", "overflowX", "overflowY", "borderTopWidth", "borderRightWidth", "borderBottomWidth",
  "borderLeftWidth", "borderStyle", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "fontStyle",
  "fontVariant", "fontWeight", "fontStretch", "fontSize", "fontSizeAdjust", "lineHeight", "fontFamily",
  "textAlign", "textTransform", "textIndent", "textDecoration", "letterSpacing", "wordSpacing", "tabSize",
  "whiteSpace", "wordBreak", "overflowWrap", "direction",
] as const;

class PlainField implements TextField {
  private mirror: HTMLDivElement;
  constructor(public el: HTMLTextAreaElement | HTMLInputElement) {
    this.mirror = document.createElement("div");
    this.mirror.setAttribute("aria-hidden", "true");
    this.mirror.dataset.gramwritingly = "false";
    document.documentElement.appendChild(this.mirror);
  }

  getText() {
    return this.el.value;
  }

  private sync() {
    const cs = getComputedStyle(this.el);
    const m = this.mirror.style;
    for (const k of COPY_STYLES) (m as unknown as Record<string, string>)[k] = cs[k] as string;
    const r = this.el.getBoundingClientRect();
    m.position = "fixed";
    m.left = `${r.left}px`;
    m.top = `${r.top}px`;
    m.width = `${r.width}px`;
    m.height = `${r.height}px`;
    m.visibility = "hidden";
    m.pointerEvents = "none";
    m.overflow = "hidden";
    m.borderColor = "transparent";
    m.margin = "0";
    if (this.el instanceof HTMLInputElement) {
      m.whiteSpace = "pre";
      m.overflowWrap = "normal";
    } else {
      m.whiteSpace = "pre-wrap";
    }
    this.mirror.textContent = this.el.value + "​";
    this.mirror.scrollTop = this.el.scrollTop;
    this.mirror.scrollLeft = this.el.scrollLeft;
  }

  rects(start: number, end: number): DOMRect[] {
    this.sync();
    const node = this.mirror.firstChild;
    if (!node) return [];
    const range = document.createRange();
    const len = node.textContent?.length ?? 0;
    range.setStart(node, Math.min(start, len));
    range.setEnd(node, Math.min(end, len));
    const box = this.el.getBoundingClientRect();
    return [...range.getClientRects()].filter((r) => r.bottom > box.top && r.top < box.bottom && r.right > box.left && r.left < box.right);
  }

  replace(start: number, end: number, value: string) {
    this.el.focus();
    this.el.setSelectionRange(start, end);
    if (!insertText(value)) {
      this.el.setRangeText(value, start, end, "end");
      this.el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    }
  }

  selection() {
    const { selectionStart: s, selectionEnd: e } = this.el;
    return s === null || e === null ? null : { start: s, end: e };
  }

  destroy() {
    this.mirror.remove();
  }
}

// ---------------------------------------------------------------------------

const BLOCK = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|DD|DIV|DL|DT|FIELDSET|FIGCAPTION|FIGURE|FOOTER|FORM|H[1-6]|HEADER|HR|LI|MAIN|NAV|OL|P|PRE|SECTION|TABLE|TR|TD|TH|UL)$/;

interface NodeSpan {
  node: Text;
  start: number;
}

class RichField implements TextField {
  private spans: NodeSpan[] = [];
  private text = "";
  constructor(public el: HTMLElement) {}

  /** Flattens the editable DOM to text, remembering where each text node starts. */
  private build() {
    const spans: NodeSpan[] = [];
    let text = "";
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node as Text;
        spans.push({ node: t, start: text.length });
        text += t.data;
        return;
      }
      if (!(node instanceof HTMLElement)) return;
      if (node.dataset.gramwritingly === "false" || node.getAttribute("contenteditable") === "false") return;
      if (node.tagName === "BR") {
        text += "\n";
        return;
      }
      const block = BLOCK.test(node.tagName);
      if (block && text && !text.endsWith("\n")) text += "\n";
      for (const child of node.childNodes) walk(child);
      if (block && text && !text.endsWith("\n")) text += "\n";
    };
    for (const child of this.el.childNodes) walk(child);
    this.spans = spans;
    this.text = text.replace(/ /g, " ");
  }

  getText() {
    this.build();
    return this.text;
  }

  private locate(offset: number): { node: Text; offset: number } | null {
    for (let i = this.spans.length - 1; i >= 0; i--) {
      const s = this.spans[i]!;
      if (offset >= s.start) return { node: s.node, offset: Math.min(offset - s.start, s.node.data.length) };
    }
    return this.spans[0] ? { node: this.spans[0].node, offset: 0 } : null;
  }

  private range(start: number, end: number): Range | null {
    const a = this.locate(start);
    const b = this.locate(end);
    if (!a || !b || !a.node.isConnected || !b.node.isConnected) return null;
    const r = document.createRange();
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
    return r;
  }

  rects(start: number, end: number): DOMRect[] {
    const r = this.range(start, end);
    if (!r) return [];
    const box = this.el.getBoundingClientRect();
    return [...r.getClientRects()].filter((x) => x.width > 0 && x.bottom > box.top && x.top < box.bottom);
  }

  replace(start: number, end: number, value: string) {
    this.build();
    const r = this.range(start, end);
    if (!r) return;
    this.el.focus();
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    if (!insertText(value)) {
      r.deleteContents();
      r.insertNode(document.createTextNode(value));
      this.el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    }
  }

  selection() {
    this.build();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const r = sel.getRangeAt(0);
    if (!this.el.contains(r.startContainer)) return null;
    const toOffset = (node: Node, off: number) => {
      const span = this.spans.find((s) => s.node === node);
      if (span) return span.start + off;
      // Element boundary: find the first text node after it.
      const probe = document.createRange();
      probe.setStart(node, off);
      const next = this.spans.find((s) => probe.comparePoint(s.node, 0) >= 0);
      return next ? next.start : this.text.length;
    };
    return { start: toOffset(r.startContainer, r.startOffset), end: toOffset(r.endContainer, r.endOffset) };
  }

  destroy() {
    this.spans = [];
  }
}
