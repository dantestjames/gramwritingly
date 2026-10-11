# Desktop helper protocol

The Mac app has two processes:

- **Gramwritingly.app** (Tauri). Owns the menu bar icon and settings window, and runs the shared TypeScript engine plus calls to the API.
- **gw-helper** (Swift, bundled inside the app). Watches the focused text field through the Accessibility API, draws underlines, shows suggestion cards and applies fixes.

They talk over the helper's stdin and stdout, one JSON object per line. All text offsets and lengths are **UTF-16 code units**, which matches both JavaScript strings and the Accessibility API.

## Helper to app

| type | fields | when |
|---|---|---|
| `ready` | `trusted` | on start |
| `trust` | `trusted` | Accessibility permission changed |
| `text` | `seq`, `app` (bundle ID), `appName`, `text` | text in the focused field settled for 0.6 s |
| `focus-lost` | | focus left a checkable field |
| `add-word` | `word` | user chose Add to dictionary |
| `rewrite` | `requestId`, `text`, `mode` | user asked for an AI rewrite |

## App to helper

| type | fields | effect |
|---|---|---|
| `config` | `enabled`, `disabledApps` | turn checking on or off, skip apps by bundle ID |
| `issues` | `seq`, `issues[]` | suggestions for the `text` message with the same `seq`; older replies are ignored |
| `rewrite-result` | `requestId`, `variants[]` or `error` | fills the rewrite card |
| `request-trust` | | shows the macOS Accessibility prompt |
| `quit` | | helper exits (it also exits when stdin closes) |

Each issue: `id`, `offset`, `length`, `colour` (`red`, `blue`, `amber`, `purple`, `green`), `title`, `message`, `replacements[]` (up to three, empty string means delete) and `sentence` (true for whole-sentence issues that offer a rewrite).

## Behaviour notes

- Browsers, terminals, code editors and password managers are skipped. The browser extension covers browsers.
- Password fields (`AXSecureTextField`) are never read.
- Electron apps (Notion, Slack, Discord) get `AXManualAccessibility` switched on so their text is readable.
- Apps that can't report the on-screen position of text still get the badge, which lists every suggestion with its fix buttons.
- Before any fix, the helper checks the text in the field still matches what was flagged.
