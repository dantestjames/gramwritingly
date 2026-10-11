import AppKit
import GWHelperCore
import SwiftUI

/// Floating panels that never take focus away from the app the user is typing in.
final class FloatingPanel: NSPanel {
    init() {
        super.init(contentRect: .zero, styleMask: [.nonactivatingPanel, .borderless], backing: .buffered, defer: true)
        isFloatingPanel = true
        level = .popUpMenu
        becomesKeyOnlyIfNeeded = true
        hidesOnDeactivate = false
        isOpaque = false
        backgroundColor = .clear
        hasShadow = true
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        isReleasedWhenClosed = false
    }

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }

    func present<V: View>(_ view: V, anchor: CGRect, width: CGFloat = 320) {
        let host = ClickThroughHost(rootView: AnyView(view.frame(width: width)))
        let size = host.fittingSize
        host.frame = CGRect(origin: .zero, size: size)
        contentView = host
        let screen = NSScreen.screens.first { $0.frame.contains(anchor.origin) } ?? NSScreen.main
        let visible = screen?.visibleFrame ?? .zero
        var origin = CGPoint(x: anchor.minX, y: anchor.minY - size.height - 6)
        if origin.y < visible.minY { origin.y = anchor.maxY + 6 }
        origin.x = min(max(visible.minX + 8, origin.x), visible.maxX - size.width - 8)
        setFrame(CGRect(origin: origin, size: size), display: true)
        orderFrontRegardless()
    }

    func dismiss() { orderOut(nil) }
}

/// Lets the first click on a button act straight away, even though the panel is never key.
final class ClickThroughHost: NSHostingView<AnyView> {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

/// Small round badge at the corner of the field showing how many suggestions there are.
struct BadgeView: View {
    let count: Int
    let errors: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(count == 0 ? "✓" : "\(count)")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 22, height: 22)
                .background(Circle().fill(count == 0 ? Color(red: 0.12, green: 0.54, blue: 0.36)
                                          : errors ? Color(red: 0.82, green: 0.2, blue: 0.17)
                                          : Color(red: 0.16, green: 0.34, blue: 0.79)))
        }
        .buttonStyle(.plain)
        .help("Gramwritingly")
    }
}

struct CardActions {
    var accept: (WireIssue, String) -> Void
    var dismiss: (WireIssue) -> Void
    var addWord: (WireIssue) -> Void
    var rewrite: (WireIssue) -> Void
    var close: () -> Void
}

/// One suggestion with its fixes.
struct IssueCard: View {
    let issue: WireIssue
    let original: String
    let actions: CardActions

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Circle().fill(Color(nsColor: Palette.colour(issue.colour))).frame(width: 8, height: 8)
                Text(issue.title).font(.caption).foregroundColor(.secondary)
                Spacer()
                Button("✕", action: actions.close).buttonStyle(.plain).foregroundColor(.secondary)
            }
            if !issue.sentence && !issue.replacements.isEmpty {
                HStack(spacing: 6) {
                    Text(original).strikethrough().foregroundColor(Color(nsColor: Palette.colour("red")))
                    ForEach(Array(issue.replacements.prefix(3).enumerated()), id: \.offset) { _, r in
                        Button(r.isEmpty ? "Remove" : r) { actions.accept(issue, r) }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.small)
                    }
                }
            }
            Text(issue.message).font(.callout).fixedSize(horizontal: false, vertical: true)
            HStack {
                if issue.sentence {
                    Button("Rewrite with AI") { actions.rewrite(issue) }.controlSize(.small)
                }
                if issue.colour == "red" && issue.title.lowercased().contains("spell") {
                    Button("Add to dictionary") { actions.addWord(issue) }.controlSize(.small)
                }
                Button("Dismiss") { actions.dismiss(issue) }.buttonStyle(.plain).foregroundColor(.secondary)
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color(nsColor: .windowBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(nsColor: .separatorColor)))
    }
}

/// Every suggestion in the field, for apps that don't report text positions.
struct IssueList: View {
    let items: [(issue: WireIssue, original: String)]
    let actions: CardActions

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Gramwritingly").font(.headline)
                Spacer()
                Button("✕", action: actions.close).buttonStyle(.plain).foregroundColor(.secondary)
            }
            if items.isEmpty {
                Text("Nothing to fix right now.").foregroundColor(.secondary)
            }
            ForEach(Array(items.prefix(8).enumerated()), id: \.offset) { _, item in
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.issue.title).font(.caption).foregroundColor(.secondary)
                    HStack(spacing: 6) {
                        Text(item.original.count > 40 ? String(item.original.prefix(40)) + "…" : item.original)
                        ForEach(Array(item.issue.replacements.prefix(2).enumerated()), id: \.offset) { _, r in
                            Button(r.isEmpty ? "Remove" : r) { actions.accept(item.issue, r) }
                                .buttonStyle(.borderedProminent).controlSize(.small)
                        }
                    }
                    Divider()
                }
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color(nsColor: .windowBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(nsColor: .separatorColor)))
    }
}

struct RewriteCard: View {
    let state: RewriteState
    let use: (String) -> Void
    let close: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Suggestions").font(.caption).foregroundColor(.secondary)
                Spacer()
                Button("✕", action: close).buttonStyle(.plain).foregroundColor(.secondary)
            }
            switch state {
            case .loading:
                ProgressView().controlSize(.small)
            case let .failed(message):
                Text(message).font(.callout)
            case let .ready(variants):
                ForEach(Array(variants.enumerated()), id: \.offset) { _, v in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(v).fixedSize(horizontal: false, vertical: true)
                        Button("Use this") { use(v) }.buttonStyle(.borderedProminent).controlSize(.small)
                    }
                    .padding(8)
                    .background(RoundedRectangle(cornerRadius: 8).fill(Color.accentColor.opacity(0.08)))
                }
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color(nsColor: .windowBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(nsColor: .separatorColor)))
    }
}

enum RewriteState {
    case loading
    case failed(String)
    case ready([String])
}
