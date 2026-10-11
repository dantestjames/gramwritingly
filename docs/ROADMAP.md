# Roadmap

## Phase 1: engine, web and browsers (this release)

- Offline core engine with 28 reports, readability, consistency, tone and plan rules
- API server with LanguageTool, Claude, Copyleaks, accounts, credits and documents
- Web editor
- Browser extension for Chromium browsers and Firefox
- CI, Docker and release workflow

## Phase 2: Mac desktop app and Safari

**Goal:** checks inside any Mac app that takes text (Word, Pages, Mail, Notes, Notion, Slack, Outlook), plus a signed, notarised installer.

### Architecture

```
apps/desktop
  src/               Tauri front end (reuses the web editor and @gramwritingly/core)
  src-tauri/         Rust shell: tray icon, settings, updater, local LanguageTool sidecar
  helpers/macos/     Swift helper using the Accessibility API (AXUIElement)
```

- **Tauri 2** shell. Installers around 10 MB versus 150 MB for Electron.
- **Swift accessibility helper** watches the focused text element (`kAXFocusedUIElementAttribute`), reads its value and selection, and gets on-screen bounds for text ranges with `kAXBoundsForRangeParameterizedAttribute`. It draws underlines in a transparent, click-through overlay window and writes fixes back with `kAXSelectedTextAttribute`.
- Apps that don't expose ranges (some Electron apps) fall back to a floating panel with the text and suggestions.
- **Offline grammar:** bundle LanguageTool as a sidecar with a slimmed Java runtime (jlink), so checks work without internet. AI features still need a connection.
- **Permissions:** first run walks the user through System Settings > Privacy & Security > Accessibility.
- **Google Docs:** use the desktop overlay plus Google Docs' accessibility mode, and ship a Docs add-on for in-document checks.

### Installer and signing

- Apple Developer Program membership (US$99 a year) for a Developer ID certificate.
- Build a universal binary (Apple silicon and Intel), sign with `codesign --options runtime`, notarise with `notarytool`, staple, and package as a `.dmg`.
- Auto-updates with the Tauri updater, signed update manifests hosted on GitHub Releases.
- GitHub Actions on `macos-latest` builds, signs and notarises on each tag. Secrets: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_PASSWORD`.

### Safari

- Run `xcrun safari-web-extension-converter apps/extension/dist/safari` to wrap the existing build in an Xcode project.
- Ship it inside the Mac app bundle so one install covers both, and submit to the Mac App Store for wider reach.

### Other phase 2 items

- Comments and sharing on documents
- PDF export with highlights
- WordPress publishing
- Reader reactions (AI preview of how an audience will read the text)
- Brand tone checks in AI prompts and the tone panel

## Phase 3: Windows

- **Helper in C#** using UI Automation (`TextPattern`, `TextPattern2`) to read text, ranges and bounding rectangles from Word, Outlook, Notion and browsers. Same overlay and write-back model as the Mac helper.
- **Installer:** Tauri builds MSI and NSIS installers. Sign with an EV or OV code-signing certificate (or Azure Trusted Signing) to avoid SmartScreen warnings.
- GitHub Actions on `windows-latest` builds and signs on each tag.
- Microsoft Edge Add-ons store listing (the Chromium build already works).

## Phase 4: store listings and billing

- Chrome Web Store, Firefox Add-ons, Edge Add-ons, Opera Add-ons
- Stripe subscriptions with plan changes handled by webhooks
- Team plans if demand appears
