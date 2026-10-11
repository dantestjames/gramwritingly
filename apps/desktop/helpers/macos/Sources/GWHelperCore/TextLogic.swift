import CoreGraphics
import Foundation

public enum TextLogic {
    /// Changed region between two strings, in UTF-16 offsets.
    public static func diffRegion(_ prev: String, _ next: String) -> (start: Int, prevEnd: Int, nextEnd: Int) {
        let a = Array(prev.utf16)
        let b = Array(next.utf16)
        var start = 0
        let minLen = min(a.count, b.count)
        while start < minLen && a[start] == b[start] { start += 1 }
        var pe = a.count
        var ne = b.count
        while pe > start && ne > start && a[pe - 1] == b[ne - 1] {
            pe -= 1
            ne -= 1
        }
        return (start, pe, ne)
    }

    /// Keeps underlines in place while the user types: drops issues touching the edit and
    /// moves the ones after it.
    public static func shift(_ issues: [WireIssue], from prev: String, to next: String) -> [WireIssue] {
        if prev == next { return issues }
        let d = diffRegion(prev, next)
        let delta = d.nextEnd - d.prevEnd
        return issues.compactMap { issue in
            if issue.end <= d.start { return issue }
            if issue.offset >= d.prevEnd {
                var moved = issue
                moved.offset += delta
                return moved
            }
            return nil
        }
    }

    /// The UTF-16 slice of a string, or nil if the range is out of bounds.
    public static func slice(_ text: String, offset: Int, length: Int) -> String? {
        let ns = text as NSString
        guard offset >= 0, length >= 0, offset + length <= ns.length else { return nil }
        return ns.substring(with: NSRange(location: offset, length: length))
    }

    /// Range to replace when applying a fix. Removing a word also removes one neighbouring space.
    public static func fixRange(text: String, issue: WireIssue, replacement: String) -> NSRange {
        let ns = text as NSString
        var start = issue.offset
        var end = issue.end
        if replacement.isEmpty {
            if end < ns.length && ns.character(at: end) == 0x20 {
                end += 1
            } else if start > 0 && ns.character(at: start - 1) == 0x20 {
                start -= 1
            }
        }
        return NSRange(location: start, length: end - start)
    }
}

public enum Geometry {
    /// Accessibility rectangles use a top-left origin on the primary screen.
    /// AppKit windows use a bottom-left origin. This flips between them.
    public static func axToCocoa(_ r: CGRect, primaryScreenHeight h: CGFloat) -> CGRect {
        CGRect(x: r.origin.x, y: h - r.origin.y - r.size.height, width: r.size.width, height: r.size.height)
    }

    /// A 2-point underline along the bottom edge of a glyph run (Cocoa coordinates).
    public static func underline(for glyphs: CGRect) -> CGRect {
        CGRect(x: glyphs.minX, y: glyphs.minY, width: glyphs.width, height: 2)
    }

    /// Index of the smallest issue whose rectangles contain the point (with a little slack).
    public static func hitTest(_ point: CGPoint, issues: [(length: Int, rects: [CGRect])]) -> Int? {
        var best: (index: Int, length: Int)?
        for (i, item) in issues.enumerated() {
            let hit = item.rects.contains { $0.insetBy(dx: -1, dy: -3).contains(point) }
            if hit, best == nil || item.length < best!.length {
                best = (i, item.length)
            }
        }
        return best?.index
    }

    /// The part of a rectangle inside the field's frame, or nil if it is scrolled out of view.
    public static func clip(_ r: CGRect, to frame: CGRect) -> CGRect? {
        let c = r.intersection(frame)
        return c.isNull || c.width < 1 || c.height < 1 ? nil : c
    }
}

/// Decides when the text in a field has settled long enough to send for checking.
public struct ChangeTracker {
    public private(set) var current = ""
    public private(set) var lastSent: String?
    private var changedAt: TimeInterval = 0
    public let settle: TimeInterval

    public init(settle: TimeInterval = 0.6) {
        self.settle = settle
    }

    public mutating func reset() {
        current = ""
        lastSent = nil
        changedAt = 0
    }

    /// Feed the latest text. Returns the text to send when it has been stable for `settle` seconds
    /// and differs from what was last sent.
    public mutating func update(_ text: String, now: TimeInterval) -> String? {
        if text != current {
            current = text
            changedAt = now
            return nil
        }
        if text != lastSent && now - changedAt >= settle {
            lastSent = text
            return text
        }
        return nil
    }
}
