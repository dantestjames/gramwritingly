# Feature checklist

Every feature from the Grammarly, ProWritingAid and Hemingway Editor feature lists (captured 11 October 2026), and where it lives in Gramwritingly.

**Status key:** ✅ built in phase 1 · 🗓 planned (see [ROADMAP.md](ROADMAP.md)) · ⛔ left out by decision

## Writing checks

| Feature | Source | Status | Where |
|---|---|---|---|
| Spelling, grammar and punctuation | All three | ✅ | LanguageTool via `/check`, merged with core |
| Australian, British, NZ, US, Canadian and South African English | PWA | ✅ | Language picker, `dialectSpelling()` |
| Readability grade and Flesch scores | Hemingway, PWA | ✅ | `readability()` |
| Yellow / red hard sentence highlights | Hemingway | ✅ | `hardSentences()` |
| Purple simpler alternatives | Hemingway | ✅ | `simplerAlternatives()` |
| Blue adverbs, passive voice, weakeners | Hemingway | ✅ | `adverbs()`, `passiveVoice()`, `qualifiers()` |
| Write and Edit modes | Hemingway | ✅ | Toolbar toggle |
| Word, character, sentence, paragraph counts, reading time | Hemingway | ✅ | Readability tab |
| See your writing tone | Grammarly | ✅ | `detectTone()` |
| Set document type with goals | PWA | ✅ | `DOCUMENT_TYPES`, goals panel |
| Target reading level | Hemingway | ✅ | Goals per document type |
| Consistency (spelling, hyphens, capitals, quotes, numbers) | PWA | ✅ | `consistency()` |
| Keep citations consistent | Grammarly | ✅ | `citations()` |
| Inclusive language | Grammarly | ✅ | `inclusive()` |
| Personal dictionary | All | ✅ | `/dictionary`, Add to dictionary |
| Custom style guide | Grammarly, PWA | ✅ | Settings, `applyStyleGuide()` |
| Brand tones | Grammarly | ✅ | Style guide settings (stored, used in AI prompts in phase 2) |

## Reports (28)

Grammar, Style, Readability, Sticky sentences, Overused words, Repeats, Echoes, Clichés, Redundancies, Sentence length, Sentence starts, Pacing, Dialogue, Sensory, Consistency, Passive voice, Adverbs, Hidden verbs, Vague words, Show don't tell, Transitions, Pronouns, Simpler words, Inclusive language, Acronyms, Corporate jargon, Homonyms, Citations. All ✅ in `packages/core/src/reports`.

| Feature | Source | Status |
|---|---|---|
| Author comparison | PWA | ✅ Genre presets plus "paste any author" (measured locally) |
| Story Canvas | PWA | ✅ Story tab for fiction documents |

## AI

| Feature | Source | Status | Where |
|---|---|---|---|
| One-click sentence rewrites | Grammarly, Hemingway | ✅ | `/ai/rewrite` mode `fix` |
| Shorten, add detail, confident, friendly, casual, formal, persuasive | Hemingway, Grammarly | ✅ | `/ai/rewrite` modes |
| Fluency (write fluently in English) | Grammarly | ✅ | mode `fluency` |
| Custom requests ("Ask Hemingway") | Hemingway | ✅ | mode `custom` |
| Voice matching | Hemingway | ✅ | Voice sample in settings |
| AI synonyms and Word Explorer | Hemingway, PWA | ✅ | `/ai/synonyms` (Pro), `/thesaurus` (Free) |
| Document review and feedback | Hemingway, PWA | ✅ | `/ai/feedback` |
| Chapter critique | PWA | ✅ | `/ai/critique` |
| Sparks and creative nudges | PWA | ✅ | `/ai/sparks` |
| Writer's block help | Hemingway | ✅ | Sparks |
| Detect AI-generated text | Grammarly | ✅ | `/ai/detect`, shown as an estimate |
| Humanizer agent | Grammarly | ✅ | AI detection returns suggested edits, plus "Sound fluent" |
| Reader reactions | Grammarly | 🗓 | Phase 2 |
| Credits metering (1 credit per sentence) | Hemingway | ✅ | `usage` table |
| Generate text with prompts | Grammarly | ✅ | Custom requests and Sparks |

## Plagiarism

| Feature | Status | Notes |
|---|---|---|
| Catch accidental plagiarism | ✅ Pro only | Copyleaks adapter, signed webhooks, 20 scans a month |

## Documents and workflow

| Feature | Source | Status |
|---|---|---|
| Save documents, unlimited storage on Pro | PWA | ✅ |
| Import Word, HTML, Markdown, text | Hemingway | ✅ |
| Export Word, HTML, Markdown, text | Hemingway | ✅ |
| Snippets | Grammarly | ✅ Text expansion in the extension |
| Dark mode | Hemingway | ✅ Follows the system |
| Comment and share | PWA | 🗓 Phase 2 |
| Save PDF with highlights intact | Hemingway Classic | 🗓 Phase 2 |
| Publish to WordPress | Hemingway Classic | 🗓 Phase 2 (desktop) |
| Offline use | Hemingway Classic | ✅ Style checks work offline in web and extension. Full offline grammar in the desktop app, phase 2 |

## Where it works

| Surface | Status |
|---|---|
| Web editor | ✅ |
| Chrome, Edge, Opera, Brave, Vivaldi | ✅ |
| Firefox | ✅ |
| Safari | 🗓 Phase 2 (build exists in `dist/safari`, needs Xcode to wrap) |
| Gmail, Outlook web, Notion, Slack, LinkedIn, WordPress, any textarea or rich editor | ✅ through the extension |
| Google Docs | 🗓 Google Docs draws text on a canvas. Phase 2 adds support through the desktop app and a Docs add-on |
| Word, Pages, Mail, Notion and other Mac apps | 🗓 Phase 2 desktop app |
| Windows apps | 🗓 Phase 3 desktop app |
| Mac and Windows installers | 🗓 Phase 2 and 3 |

## Left out by decision

These were excluded when the project was scoped:

- Team and enterprise admin: SSO, SCIM, audit logs, user groups, analytics dashboards, ROI reports, managed mode, data loss prevention, BYOK.
- Billing (Stripe). Plans are switched with `set-plan` for now.
- Community: live workshops, co-writing sprints, critique groups, networking events, writing challenges.
- Story Credits marketplace and gift subscriptions.
