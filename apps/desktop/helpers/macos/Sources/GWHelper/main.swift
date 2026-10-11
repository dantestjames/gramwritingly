import AppKit

// gw-helper: runs in the background (no Dock icon), started by the Gramwritingly desktop app.
// It talks to the app over stdin/stdout using one JSON object per line.
// See docs/desktop-protocol.md.

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let controller = Controller()
IO.listen { controller.handle($0) }
controller.start()

app.run()
