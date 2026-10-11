import { diffRegion, shiftIssues, underlineColour, type Issue } from "@gramwritingly/core";
import { createField, editableRoot, isCheckable, type TextField } from "./fields";
import { getSettings, send, siteKey, type CheckReply, type ExtSettings } from "./shared";
import { CSS } from "./ui-css";

const MAX_CHARS = 60_000;
const READABILITY_KINDS = new Set(["hard", "very-hard", "simpler", "adverb", "passive", "weak"]);

let settings: ExtSettings;
let field: TextField | null = null;
let issues: Issue[] = [];
let lastText = "";
let checkTimer: number | undefined;
let checkSeq = 0;
let source: CheckReply["source"] = "server";
let drawQueued = false;
const dismissed = new Set<string>();
let snippets: { shortcut: string; body: string }[] = [];
let expanding = false;
let resizeObserver: ResizeObserver | null = null;

// ---- Shadow-DOM overlay ---------------------------------------------------
const host = document.createElement("gramwritingly-overlay");
host.dataset.gramwritingly = "false";
const shadow = host.attachShadow({ mode: "closed" });
const style = document.createElement("style");
style.textContent = CSS;
const layer = document.createElement("div");
layer.className = "layer";
const badge = document.createElement("button");
badge.className = "badge";
badge.title = "Gramwritingly";
const card = document.createElement("div");
card.className = "card";
card.hidden = true;
shadow.append(style, layer, badge, card);

function mount() {
  if (!host.isConnected) document.documentElement.appendChild(host);
}

// ---- Startup --------------------------------------------------------------
(async function init() {
  settings = await getSettings();
  if (!settings.enabled || settings.disabledSites.includes(siteKey(location.href))) return;
  if (location.hostname === "docs.google.com" && /^\/(document|spreadsheets|presentation)\//.test(location.pathname)) {
    // Google Docs draws text on a canvas. Supported through the desktop app in a later phase.
    return;
  }
  document.addEventListener("focusin", onFocus, true);
  document.addEventListener("input", onInput, true);
  document.addEventListener("mouseup", onPointer, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideCard(); }, true);
  window.addEventListener("scroll", queueDraw, true);
  window.addEventListener("resize", queueDraw);
  chrome.storage.onChanged.addListener(async () => {
    settings = await getSettings();
    if (!settings.enabled) detach();
  });
  chrome.runtime.onMessage.addListener((msg: { type: string; mode?: string }) => {
    if (msg.type === "gw-rewrite-selection" && msg.mode) rewriteSelection(msg.mode);
  });
  const s = await send<{ shortcut: string; body: string }[]>({ type: "snippets" });
  if (s.ok) snippets = s.data;
  // Field may already be focused when the script loads.
  if (document.activeElement) onFocus({ target: document.activeElement } as unknown as FocusEvent);
})();

function onFocus(e: FocusEvent) {
  let target = e.target as HTMLElement | null;
  if (target && target.isContentEditable) target = editableRoot(target);
  if (!isCheckable(target)) return;
  if (field?.el === target) return;
  attach(target);
}

function attach(el: HTMLElement) {
  detach();
  mount();
  field = createField(el);
  issues = [];
  lastText = "";
  scheduleCheck(50);
  resizeObserver = new ResizeObserver(queueDraw);
  resizeObserver.observe(el);
  el.addEventListener("scroll", queueDraw, { passive: true });
}

function detach() {
  resizeObserver?.disconnect();
  resizeObserver = null;
  field?.el.removeEventListener("scroll", queueDraw);
  field?.destroy();
  field = null;
  issues = [];
  layer.replaceChildren();
  badge.style.display = "none";
  hideCard();
}

// ---- Checking -------------------------------------------------------------
function onInput(e: Event) {
  if (!field || !(e.target instanceof Node) || !field.el.contains(e.target)) return;
  const text = field.getText();
  // Expand only on typed characters, never on undo, delete or our own insertions.
  const typed = e instanceof InputEvent && (e.inputType === "insertText" || e.inputType === "insertCompositionText");
  if (typed && !expanding && expandSnippet(text)) return;
  if (text !== lastText) {
    const d = diffRegion(lastText, text);
    issues = shiftIssues(issues, d.start, d.prevEnd, d.nextEnd - d.prevEnd);
    lastText = text;
    queueDraw();
  }
  hideCard();
  scheduleCheck(800);
}

function scheduleCheck(delay: number) {
  clearTimeout(checkTimer);
  checkTimer = window.setTimeout(runCheck, delay);
}

async function runCheck() {
  if (!field) return;
  const text = field.getText();
  lastText = text;
  if (!text.trim() || text.length > MAX_CHARS) {
    issues = [];
    return queueDraw();
  }
  const seq = ++checkSeq;
  badge.dataset.state = "busy";
  const res = await send<CheckReply>({ type: "check", text });
  if (seq !== checkSeq || !field) return;
  if (!res.ok) return;
  source = res.data.source;
  // Text may have changed while waiting; drop issues if so (the next check will refresh).
  issues = field.getText() === text ? res.data.issues.filter(keep) : [];
  queueDraw();
}

function keep(i: Issue) {
  if (!settings.readabilityInline && i.highlight && READABILITY_KINDS.has(i.highlight)) return false;
  if (i.category === "readability") return settings.readabilityInline;
  return !dismissed.has(dismissKey(i));
}

function dismissKey(i: Issue) {
  return `${i.rule}|${lastText.slice(i.offset, i.offset + i.length).toLowerCase()}`;
}

// ---- Drawing --------------------------------------------------------------
interface Hit {
  issue: Issue;
  rects: DOMRect[];
}
let hits: Hit[] = [];

function queueDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => {
    drawQueued = false;
    draw();
  });
}

function draw() {
  layer.replaceChildren();
  hits = [];
  if (!field || !field.el.isConnected) {
    badge.style.display = "none";
    return;
  }
  field.prepare();
  const frag = document.createDocumentFragment();
  for (const issue of issues) {
    const rects = field.rects(issue.offset, issue.offset + issue.length);
    if (!rects.length) continue;
    hits.push({ issue, rects });
    for (const r of rects) {
      const mark = document.createElement("div");
      const sentence = issue.highlight === "hard" || issue.highlight === "very-hard";
      mark.className = sentence ? `hl hl-${issue.highlight}` : `ul ul-${underlineColour(issue)}`;
      mark.style.left = `${r.left}px`;
      mark.style.width = `${r.width}px`;
      if (sentence) {
        mark.style.top = `${r.top}px`;
        mark.style.height = `${r.height}px`;
      } else {
        mark.style.top = `${r.bottom - 2}px`;
      }
      frag.appendChild(mark);
    }
  }
  layer.appendChild(frag);
  placeBadge();
}

function placeBadge() {
  if (!field) return;
  const r = field.el.getBoundingClientRect();
  if (r.width < 80 || r.height < 18) {
    badge.style.display = "none";
    return;
  }
  const errors = issues.filter((i) => i.severity === "error").length;
  badge.style.display = "flex";
  badge.style.left = `${r.right - 30}px`;
  badge.style.top = `${r.bottom - 30}px`;
  badge.textContent = issues.length ? String(issues.length) : "✓";
  badge.dataset.state = issues.length ? (errors ? "errors" : "suggestions") : "clean";
  badge.title = source === "local" ? "Gramwritingly (offline: style checks only)" : `${issues.length} suggestion${issues.length === 1 ? "" : "s"}`;
}

badge.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the field
badge.addEventListener("click", () => {
  if (!issues.length) return;
  const first = hits[0];
  if (first) showIssue(first);
});

// ---- Cards ----------------------------------------------------------------
function onPointer(e: MouseEvent) {
  if (e.composedPath().includes(host)) return;
  if (!field || !field.el.contains(e.target as Node)) return hideCard();
  const hit = hits
    .filter((h) => h.rects.some((r) => e.clientX >= r.left - 1 && e.clientX <= r.right + 1 && e.clientY >= r.top - 2 && e.clientY <= r.bottom + 3))
    .sort((a, b) => a.issue.length - b.issue.length)[0];
  if (hit) showIssue(hit);
  else hideCard();
}

function positionCard(anchor: DOMRect) {
  card.hidden = false;
  const w = 320;
  const left = Math.min(Math.max(8, anchor.left), window.innerWidth - w - 8);
  const below = anchor.bottom + 8;
  card.style.left = `${left}px`;
  card.style.top = `${below}px`;
  requestAnimationFrame(() => {
    const h = card.offsetHeight;
    if (below + h > window.innerHeight - 8) card.style.top = `${Math.max(8, anchor.top - h - 8)}px`;
  });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function button(label: string, cls: string, onClick: () => void) {
  const b = el("button", cls, label);
  b.addEventListener("mousedown", (e) => e.preventDefault());
  b.addEventListener("click", onClick);
  return b;
}

function showIssue({ issue, rects }: Hit) {
  if (!field) return;
  const original = lastText.slice(issue.offset, issue.offset + issue.length);
  card.replaceChildren();
  card.append(el("div", `kind dot-${underlineColour(issue)}`, issue.title ?? issue.category));
  const short = issue.length <= 60;
  if (short && issue.replacements.length) {
    const row = el("div", "fixes");
    row.append(el("s", "", original));
    for (const r of issue.replacements.slice(0, 3)) {
      row.append(button(r === "" ? "Remove" : r, "fix", () => applyFix(issue, r)));
    }
    card.append(row);
  }
  card.append(el("p", "msg", issue.message));
  const actions = el("div", "actions");
  if (!short) actions.append(button("Rewrite with AI", "act primary", () => rewriteRange(issue.offset, issue.offset + issue.length, "fix")));
  if (issue.category === "spelling") {
    actions.append(button("Add to dictionary", "act", async () => {
      dismissed.add(dismissKey(issue));
      issues = issues.filter((i) => i !== issue);
      hideCard();
      queueDraw();
      await send({ type: "addWord", word: original });
    }));
  }
  actions.append(button("Dismiss", "act quiet", () => {
    dismissed.add(dismissKey(issue));
    issues = issues.filter((i) => i !== issue);
    hideCard();
    queueDraw();
  }));
  card.append(actions);
  positionCard(rects[rects.length - 1]!);
}

function hideCard() {
  card.hidden = true;
}

function applyFix(issue: Issue, replacement: string) {
  if (!field) return;
  // The page may have changed the field without an input event; never overwrite the wrong text.
  const flagged = lastText.slice(issue.offset, issue.offset + issue.length);
  if (field.getText().slice(issue.offset, issue.offset + issue.length) !== flagged) {
    hideCard();
    scheduleCheck(0);
    return;
  }
  let start = issue.offset;
  let end = issue.offset + issue.length;
  if (replacement === "") {
    // Remove a word and one neighbouring space.
    if (lastText[end] === " ") end++;
    else if (lastText[start - 1] === " ") start--;
  }
  field.replace(start, end, replacement);
  issues = issues.filter((i) => i !== issue);
  hideCard();
  onInput({ target: field.el } as unknown as Event);
}

// ---- AI rewrite -----------------------------------------------------------
function rewriteSelection(mode: string) {
  if (!field) {
    const active = document.activeElement as HTMLElement | null;
    const target = active?.isContentEditable ? editableRoot(active) : active;
    if (isCheckable(target)) attach(target);
  }
  const sel = field?.selection();
  if (!field || !sel || sel.start === sel.end) return;
  rewriteRange(sel.start, sel.end, mode);
}

async function rewriteRange(start: number, end: number, mode: string) {
  if (!field) return;
  const text = field.getText().slice(start, end);
  field.prepare();
  const anchor = field.rects(start, end).pop() ?? field.el.getBoundingClientRect();
  card.replaceChildren(el("div", "kind dot-blue", "Rewriting…"));
  positionCard(anchor);
  const res = await send<{ variants: string[]; explanation: string }>({ type: "rewrite", text, mode });
  card.replaceChildren();
  if (!res.ok) {
    card.append(el("div", "kind dot-red", "Couldn't rewrite"));
    card.append(el("p", "msg", res.code === "unauthorised" ? "Sign in from the Gramwritingly toolbar button to use AI rewrites." : res.error));
    card.append(button("Close", "act quiet", hideCard));
    return;
  }
  card.append(el("div", "kind dot-blue", "Suggestions"));
  if (res.data.explanation) card.append(el("p", "msg", res.data.explanation));
  for (const v of res.data.variants) {
    const box = el("div", "variant");
    box.append(el("p", "", v));
    box.append(button("Use this", "act primary", () => {
      if (field && field.getText().slice(start, end) === text) field.replace(start, end, v);
      hideCard();
    }));
    card.append(box);
  }
  card.append(button("Close", "act quiet", hideCard));
}

// ---- Snippets -------------------------------------------------------------
function expandSnippet(text: string): boolean {
  if (!field || !snippets.length) return false;
  const sel = field.selection();
  if (!sel || sel.start !== sel.end) return false;
  const before = text.slice(0, sel.start);
  const hit = snippets.find((s) => before.endsWith(s.shortcut) && (before.length === s.shortcut.length || /\s/.test(before[before.length - s.shortcut.length - 1]!)));
  if (!hit) return false;
  expanding = true;
  try {
    field.replace(sel.start - hit.shortcut.length, sel.start, hit.body);
  } finally {
    expanding = false;
  }
  return true;
}
