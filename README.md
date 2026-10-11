# Gramwritingly

Spelling, grammar, readability, style reports and AI rewrites in one place. It brings together the best of Grammarly, ProWritingAid and Hemingway Editor, with Australian English as the default.

It runs in three places:

| Where | What you get | Status |
|---|---|---|
| **Web editor** | Full editor with highlights, 28 reports, AI tools, documents, import and export | Phase 1, ready |
| **Browser extension** | Underlines and fixes in any text box on Chrome, Edge, Opera, Brave and Firefox | Phase 1, ready |
| **Desktop app** (Mac, then Windows) | Checks inside Word, Notion, Mail, Slack and other apps | Phase 2 and 3, see [docs/ROADMAP.md](docs/ROADMAP.md) |
| **Safari extension** | Same as the browser extension | Phase 2 (needs a Mac to package) |

See [docs/FEATURES.md](docs/FEATURES.md) for the full feature checklist against Grammarly, ProWritingAid and Hemingway.

## How it works

```
┌──────────────┐   ┌──────────────────┐   ┌─────────────────┐
│ Web editor   │   │ Browser extension│   │ Desktop app     │
│ (React)      │   │ (Manifest V3)    │   │ (Tauri, phase 2)│
└──────┬───────┘   └────────┬─────────┘   └────────┬────────┘
       │  instant, offline  │                      │
       ├──────► @gramwritingly/core ◄──────────────┤   readability, 28 reports,
       │        (runs in the browser too)          │   consistency, tone, plans
       ▼                    ▼                      ▼
┌──────────────────────────────────────────────────────────┐
│ API server (Fastify, SQLite)                             │
│  /check    LanguageTool spelling + grammar, merged       │
│  /ai/*     Claude: rewrites, tone, feedback, critiques   │
│  /plagiarism  Copyleaks (Pro only)                       │
│  accounts, plans, credits, documents, dictionary,        │
│  style guide, snippets                                   │
└───────────┬───────────────────────┬──────────────────────┘
            ▼                       ▼
   LanguageTool (self-hosted)   Claude API
```

Style and readability checks run on the device on every keystroke, so highlights appear instantly and keep working offline. Spelling and grammar come from a self-hosted LanguageTool server after a short pause. AI features call the Claude API from the server, so API keys never reach the browser.

## Repository layout

```
packages/core      Offline analysis engine (TypeScript, no dependencies)
apps/server        API server
apps/web           Web editor
apps/extension     Browser extension (Chromium, Firefox and Safari builds)
docs/              Feature checklist and roadmap
assets/            App icons
```

## Quick start

You need Node 22.13 or newer and pnpm 10.

```bash
pnpm install
pnpm --filter @gramwritingly/core build
cp .env.example .env            # add ANTHROPIC_API_KEY for AI features
```

Start LanguageTool (spelling and grammar):

```bash
docker run -d -p 8010:8010 erikvl87/languagetool
```

Then, in two terminals:

```bash
pnpm dev:server                 # http://localhost:8787
pnpm dev:web                    # http://localhost:5173
```

Or run everything with Docker:

```bash
cp .env.example .env
docker compose up --build
```

### Load the browser extension

```bash
pnpm build:extension
```

- **Chrome, Edge, Opera, Brave:** open the extensions page, turn on Developer mode, choose *Load unpacked* and pick `apps/extension/dist/chromium`.
- **Firefox:** open `about:debugging`, choose *This Firefox*, then *Load Temporary Add-on* and pick `apps/extension/dist/firefox/manifest.json`.

Open the extension's Settings to point it at your server if it isn't on `localhost:8787`.

### Give an account Pro

Billing is not part of phase 1. Switch a user's plan from the command line:

```bash
pnpm --filter @gramwritingly/server set-plan someone@example.com pro
```

## Plans

| | Free | Pro |
|---|---|---|
| Spelling, grammar, punctuation | Unlimited | Unlimited, plus picky checks |
| Readability highlights and grade | Yes | Yes |
| Tone detection | Yes | Yes |
| Style reports | 8 core reports, first 1,000 words | All 28, any length |
| AI sentence fixes | 100 credits a month | 5,000 credits a month |
| Tone tools, fluency, custom AI requests | | Yes |
| Editor feedback | | Yes |
| Chapter critiques | | 30 a day |
| Sparks (idea generator) | 3 a day | 50 a day |
| AI-text detection | | Yes |
| Plagiarism check | | 20 scans a month |
| Style guide, brand tone, snippets | | Yes |
| Author comparison | | Yes |
| Personal dictionary | Yes | Yes |
| Import .docx, export .docx/.md/.html | | Yes |

Limits live in `packages/core/src/plans.ts`. Prices shown in the app are placeholders in AUD.

## Configuration

All settings are environment variables. See [.env.example](.env.example).

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Turns on AI features |
| `CLAUDE_FAST_MODEL` | Model for rewrites, sparks and synonyms |
| `CLAUDE_DEEP_MODEL` | Model for feedback, critiques and AI detection |
| `LANGUAGETOOL_URL` | Your LanguageTool server |
| `PLAGIARISM_PROVIDER` | `copyleaks` or `none` |
| `COPYLEAKS_EMAIL`, `COPYLEAKS_API_KEY` | Copyleaks credentials (Pro plagiarism checks) |
| `PUBLIC_API_URL` | Public address of the API, used for Copyleaks webhooks |
| `JWT_SECRET` | Long random string. Required in production |

## Privacy

- Text sent for checking is processed in memory and not stored. Only documents a signed-in user saves are kept.
- Spelling and grammar run on your own LanguageTool server. No text goes to a third-party grammar service.
- AI features send the selected text to the Claude API. Plagiarism scans send the text to Copyleaks.
- The extension skips password, email, card and one-time-code fields, and respects `data-gramwritingly="false"` and `data-gramm="false"` on any element.
- Users can switch the extension off per site from its toolbar button.

## Testing

```bash
pnpm test        # unit and API tests
pnpm typecheck
```

## Licence

Proprietary. All rights reserved.
