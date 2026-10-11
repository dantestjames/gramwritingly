/** Styles for the in-page overlay. Lives inside a closed shadow root so pages can't restyle it. */
export const CSS = `
:host { all: initial; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; }
.ul { position: fixed; height: 2px; border-radius: 1px; pointer-events: none; }
.ul-red { background: #d0342c; }
.ul-blue { background: #2856c9; }
.ul-amber { background: repeating-linear-gradient(90deg, #b7791f 0 4px, transparent 4px 6px); }
.ul-purple { background: #7c4dcc; }
.ul-green { background: repeating-linear-gradient(90deg, #1f8a5b 0 2px, transparent 2px 4px); }
.hl { position: fixed; pointer-events: none; mix-blend-mode: multiply; border-radius: 2px; }
.hl-hard { background: rgba(251, 222, 80, 0.35); }
.hl-very-hard { background: rgba(240, 100, 90, 0.25); }

.badge {
  position: fixed; z-index: 2147483647; width: 22px; height: 22px; border-radius: 50%; border: 0;
  display: none; align-items: center; justify-content: center; cursor: pointer;
  font: 600 11px/1 system-ui, sans-serif; color: #fff; background: #2856c9;
  box-shadow: 0 2px 6px rgba(0,0,0,.25);
}
.badge[data-state="errors"] { background: #d0342c; }
.badge[data-state="clean"] { background: #1f8a5b; }
.badge[data-state="busy"] { opacity: .6; }

.card {
  position: fixed; z-index: 2147483647; width: 320px; max-height: 60vh; overflow: auto;
  background: #fff; color: #18212d; border: 1px solid #d3d9e0; border-radius: 10px; padding: 12px 14px;
  box-shadow: 0 12px 32px rgba(24,33,45,.18); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.card[hidden] { display: none; }
.kind { font-size: 12px; color: #5b6676; display: flex; align-items: center; gap: 6px; text-transform: none; }
.kind::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
.dot-red::before { background: #d0342c; } .dot-blue::before { background: #2856c9; } .dot-amber::before { background: #b7791f; }
.dot-purple::before { background: #7c4dcc; } .dot-green::before { background: #1f8a5b; }
.fixes { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 8px 0; font-size: 15px; }
.fixes s { color: #d0342c; }
.fix { background: #2856c9; color: #fff; border: 0; border-radius: 999px; padding: 4px 11px; cursor: pointer; font: inherit; }
.msg { margin: 6px 0; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.act { border: 1px solid #d3d9e0; background: #fff; border-radius: 7px; padding: 3px 10px; cursor: pointer; font: 13px system-ui, sans-serif; color: #18212d; }
.act.primary { background: #2856c9; color: #fff; border-color: #2856c9; }
.act.quiet { border-color: transparent; color: #5b6676; }
.variant { background: #f2f5fb; border-radius: 8px; padding: 8px 10px; margin: 8px 0; }
.variant p { margin: 0 0 6px; }

@media (prefers-color-scheme: dark) {
  .card { background: #1b222c; color: #e7ebf0; border-color: #2c3540; }
  .act { background: #1b222c; color: #e7ebf0; border-color: #2c3540; }
  .variant { background: #222d45; }
  .hl { mix-blend-mode: normal; }
}
`;
