import AppKit

/// A transparent, click-through window that sits over the focused text field and draws underlines.
final class OverlayWindow: NSWindow {
    private let canvas = UnderlineView()

    init() {
        super.init(contentRect: .zero, styleMask: .borderless, backing: .buffered, defer: true)
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        ignoresMouseEvents = true
        level = .floating
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        isReleasedWhenClosed = false
        contentView = canvas
    }

    /// `frame` and every mark rect are in Cocoa screen coordinates.
    func show(frame: CGRect, marks: [(rect: CGRect, colour: NSColor, dashed: Bool)]) {
        if marks.isEmpty {
            orderOut(nil)
            return
        }
        setFrame(frame, display: false)
        canvas.marks = marks.map { m in
            (CGRect(x: m.rect.minX - frame.minX, y: m.rect.minY - frame.minY, width: m.rect.width, height: m.rect.height), m.colour, m.dashed)
        }
        canvas.needsDisplay = true
        orderFrontRegardless()
    }

    func hide() {
        orderOut(nil)
    }
}

private final class UnderlineView: NSView {
    var marks: [(rect: CGRect, colour: NSColor, dashed: Bool)] = []

    override func draw(_ dirtyRect: NSRect) {
        for m in marks {
            m.colour.setFill()
            if m.dashed {
                var x = m.rect.minX
                while x < m.rect.maxX {
                    NSRect(x: x, y: m.rect.minY, width: min(4, m.rect.maxX - x), height: m.rect.height).fill()
                    x += 6
                }
            } else {
                NSBezierPath(roundedRect: m.rect, xRadius: 1, yRadius: 1).fill()
            }
        }
    }
}

enum Palette {
    static func colour(_ key: String) -> NSColor {
        switch key {
        case "red": return NSColor(srgbRed: 0.82, green: 0.20, blue: 0.17, alpha: 1)
        case "blue": return NSColor(srgbRed: 0.16, green: 0.34, blue: 0.79, alpha: 1)
        case "purple": return NSColor(srgbRed: 0.49, green: 0.30, blue: 0.80, alpha: 1)
        case "green": return NSColor(srgbRed: 0.12, green: 0.54, blue: 0.36, alpha: 1)
        default: return NSColor(srgbRed: 0.72, green: 0.47, blue: 0.12, alpha: 1)
        }
    }

    static func dashed(_ key: String) -> Bool { key == "amber" || key == "green" }
}
