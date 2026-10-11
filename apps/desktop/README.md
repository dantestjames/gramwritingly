# Gramwritingly for Mac

A menu bar app that checks writing in Mail, Notes, Pages, Word, Outlook, Notion, Slack and other Mac apps.

## Build

Needs macOS 13+, Xcode command line tools, Rust and Node 22.

```bash
pnpm install
pnpm --filter @gramwritingly/core build
cd apps/desktop
pnpm app:dev      # builds the Swift helper, then runs the app
pnpm app:build    # release .app and .dmg in src-tauri/target/release/bundle
```

For one installer covering Apple silicon and Intel:

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
node scripts/build-helper.mjs --universal
pnpm tauri build --target universal-apple-darwin
```

Run the helper's tests with `swift test` in `helpers/macos`.

## First run

macOS asks for Accessibility access the first time. Open System Settings > Privacy & Security > Accessibility and turn on Gramwritingly. Unsigned development builds lose this permission each time they are rebuilt, so turn it off and on again after a rebuild.

## Signing and notarisation

GitHub Actions signs and notarises the DMG when these repository secrets are set:

| Secret | What it is |
|---|---|
| `APPLE_CERTIFICATE` | Developer ID Application certificate, exported as .p12 and base64 encoded |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the .p12 |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID` | Apple ID email |
| `APPLE_PASSWORD` | App-specific password for that Apple ID |
| `APPLE_TEAM_ID` | Your 10-character team ID |

Without them the DMG is ad-hoc signed. It still runs, but people must right-click the app and choose Open the first time.

## How it fits together

See [docs/desktop-protocol.md](../../docs/desktop-protocol.md).
