import AppKit
import ApplicationServices
import GWHelperCore

/// Apps the helper never checks: browsers (the extension covers them), code editors,
/// terminals, password managers and Gramwritingly itself.
private let alwaysSkipped: Set<String> = [
    "app.gramwritingly.desktop",
    "com.google.Chrome", "com.google.Chrome.canary", "com.microsoft.edgemac", "com.operasoftware.Opera",
    "org.mozilla.firefox", "com.apple.Safari", "com.brave.Browser", "company.thebrowser.Browser", "com.vivaldi.Vivaldi",
    "com.apple.Terminal", "com.googlecode.iterm2", "dev.warp.Warp-Stable", "com.apple.dt.Xcode", "com.microsoft.VSCode",
    "com.1password.1password", "com.bitwarden.desktop", "com.apple.keychainaccess",
]

private let maxChars = 60_000
private let maxIssuesDrawn = 120

final class Controller {
    private var config = HelperConfig()
    private var trusted = false
    private var lastTrustCheck: TimeInterval = 0

    // Focused field
    private var element: AXUIElement?
    private var bundleId = ""
    private var appName = ""
    private var tracker = ChangeTracker(settle: 0.6)
    private var accessibilityEnabledPids = Set<pid_t>()

    // Suggestions for the current field
    private var seq = 0
    private var issues: [WireIssue] = []
    private var issuesText = ""
    private var dismissed = Set<String>()
    private var drawn: [(issue: WireIssue, rects: [CGRect])] = []

    // Windows
    private let overlay = OverlayWindow()
    private let badge = FloatingPanel()
    private let card = FloatingPanel()
    private var badgeKey = ""
    private var cardIssueId: String?

    // AI rewrites waiting for the app
    private var rewriteId = 0
    private var pendingRewrites: [Int: (range: NSRange, original: String, anchor: CGRect)] = [:]

    private var timer: Timer?
    private var clickMonitor: Any?

    func start() {
        trusted = AX.isTrusted(prompt: false)
        IO.log("started pid=\(getpid()) trusted=\(trusted) path=\(Bundle.main.executablePath ?? "?")")
        IO.send(.ready(trusted: trusted))
        timer = Timer.scheduledTimer(withTimeInterval: 0.3, repeats: true) { [weak self] _ in self?.tick() }
        clickMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseUp]) { [weak self] _ in
            self?.handleClick(at: NSEvent.mouseLocation)
        }
        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
        ) { [weak self] _ in self?.render() }
    }

    // MARK: Messages from the app

    func handle(_ msg: InMessage) {
        switch msg {
        case let .config(c):
            config = c
            if !c.enabled { clearField() }
        case let .issues(replySeq, list):
            // A reply for older text is shifted onto the current text when possible.
            guard replySeq == seq else { return }
            issues = list
            issuesText = tracker.lastSent ?? issuesText
            if let el = element, let now = AX.string(el, kAXValueAttribute) {
                issues = TextLogic.shift(issues, from: issuesText, to: now)
                issuesText = now
            }
            badgeKey = ""
            render()
        case let .rewriteResult(id, variants, error):
            guard let pending = pendingRewrites.removeValue(forKey: id) else { return }
            if let error {
                presentRewrite(.failed(error), pending: pending)
            } else {
                presentRewrite(.ready(variants), pending: pending)
            }
        case .requestTrust:
            trusted = AX.isTrusted(prompt: true)
            IO.log("trust prompt shown, trusted=\(trusted)")
            IO.send(.trust(trusted: trusted))
        case .hello:
            trusted = AX.isTrusted(prompt: false)
            IO.log("hello pid=\(getpid()) ppid=\(getppid()) trusted=\(trusted) path=\(Bundle.main.executablePath ?? "?")")
            IO.send(.ready(trusted: trusted))
        case .quit:
            exit(0)
        }
    }

    // MARK: Polling

    private func tick() {
        let now = ProcessInfo.processInfo.systemUptime
        if !trusted {
            if now - lastTrustCheck > 1 {
                lastTrustCheck = now
                trusted = AX.isTrusted(prompt: false)
                if trusted {
                    IO.log("accessibility granted")
                    IO.send(.trust(trusted: true))
                }
            }
            if !trusted { return }
        }
        guard config.enabled,
              let el = AX.focusedElement(),
              let pid = AX.pid(el),
              pid != getpid(),
              let app = NSRunningApplication(processIdentifier: pid),
              let bundle = app.bundleIdentifier,
              !alwaysSkipped.contains(bundle),
              !config.disabledApps.contains(bundle)
        else {
            if element != nil { clearField() }
            return
        }

        if !accessibilityEnabledPids.contains(pid) {
            accessibilityEnabledPids.insert(pid)
            AX.enableManualAccessibility(pid: pid)
        }

        guard AX.isCheckable(el) else {
            if element != nil { clearField() }
            return
        }

        if element == nil || !CFEqual(element!, el) {
            clearField()
            element = el
            bundleId = bundle
            appName = app.localizedName ?? bundle
        }

        let text = AX.string(el, kAXValueAttribute) ?? ""
        if (text as NSString).length > maxChars {
            hideAll()
            return
        }
        if text != issuesText {
            issues = TextLogic.shift(issues, from: issuesText, to: text)
            issuesText = text
            card.dismiss()
            cardIssueId = nil
        }
        if let ready = tracker.update(text, now: now) {
            seq += 1
            if ready.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                issues = []
            } else {
                IO.send(.text(seq: seq, app: bundleId, appName: appName, text: ready))
            }
        }
        render()
    }

    private func clearField() {
        if element != nil { IO.send(.focusLost) }
        element = nil
        tracker.reset()
        issues = []
        issuesText = ""
        drawn = []
        hideAll()
    }

    private func hideAll() {
        overlay.hide()
        badge.dismiss()
        card.dismiss()
        badgeKey = ""
        cardIssueId = nil
    }

    // MARK: Drawing

    private var primaryHeight: CGFloat { NSScreen.screens.first?.frame.height ?? 0 }

    private func visibleIssues() -> [WireIssue] {
        issues.filter { !dismissed.contains(dismissKey($0)) }
    }

    private func dismissKey(_ issue: WireIssue) -> String {
        let original = TextLogic.slice(issuesText, offset: issue.offset, length: issue.length) ?? ""
        return "\(issue.title)|\(original.lowercased())"
    }

    private func render() {
        guard let el = element, let axFrame = AX.frame(el) else { return hideAll() }
        let frame = Geometry.axToCocoa(axFrame, primaryScreenHeight: primaryHeight)
        let list = visibleIssues()

        drawn = []
        var marks: [(rect: CGRect, colour: NSColor, dashed: Bool)] = []
        for issue in list.prefix(maxIssuesDrawn) where !issue.sentence {
            guard let ax = AX.bounds(el, offset: issue.offset, length: issue.length) else { continue }
            let glyphs = Geometry.axToCocoa(ax, primaryScreenHeight: primaryHeight)
            guard let visible = Geometry.clip(glyphs, to: frame) else { continue }
            drawn.append((issue, [visible]))
            marks.append((Geometry.underline(for: visible), Palette.colour(issue.colour), Palette.dashed(issue.colour)))
        }
        // Sentence-level issues are reached through the badge list, so they stay clickable
        // without painting whole sentences in someone else's app.
        overlay.show(frame: frame, marks: marks)
        renderBadge(frame: frame, list: list)
    }

    private func renderBadge(frame: CGRect, list: [WireIssue]) {
        guard frame.width >= 80, frame.height >= 18 else { return badge.dismiss() }
        let errors = list.contains { $0.colour == "red" }
        let key = "\(list.count)|\(errors)|\(Int(frame.maxX))|\(Int(frame.minY))"
        guard key != badgeKey else { return }
        badgeKey = key
        let anchor = CGRect(x: frame.maxX - 30, y: frame.minY + 34, width: 22, height: 22)
        badge.present(BadgeView(count: list.count, errors: errors) { [weak self] in self?.showList() }, anchor: anchor, width: 22)
    }

    // MARK: Cards

    private func handleClick(at point: CGPoint) {
        let hit = Geometry.hitTest(point, issues: drawn.map { ($0.issue.length, $0.rects) })
        guard let index = hit else {
            if card.isVisible && !card.frame.contains(point) {
                card.dismiss()
                cardIssueId = nil
            }
            return
        }
        let entry = drawn[index]
        showCard(entry.issue, anchor: entry.rects.last ?? .zero)
    }

    private var actions: CardActions {
        CardActions(
            accept: { [weak self] issue, r in self?.accept(issue, r) },
            dismiss: { [weak self] issue in
                guard let self else { return }
                dismissed.insert(dismissKey(issue))
                card.dismiss()
                badgeKey = ""
                render()
            },
            addWord: { [weak self] issue in
                guard let self else { return }
                if let word = TextLogic.slice(issuesText, offset: issue.offset, length: issue.length) {
                    IO.send(.addWord(word: word))
                }
                dismissed.insert(dismissKey(issue))
                card.dismiss()
                badgeKey = ""
                render()
            },
            rewrite: { [weak self] issue in self?.requestRewrite(issue) },
            close: { [weak self] in self?.card.dismiss() }
        )
    }

    private func showCard(_ issue: WireIssue, anchor: CGRect) {
        cardIssueId = issue.id
        let original = TextLogic.slice(issuesText, offset: issue.offset, length: issue.length) ?? ""
        card.present(IssueCard(issue: issue, original: original, actions: actions), anchor: anchor)
    }

    private func showList() {
        let items = visibleIssues().map { ($0, TextLogic.slice(issuesText, offset: $0.offset, length: $0.length) ?? "") }
        let anchor = badge.frame
        card.present(IssueList(items: items, actions: CardActions(
            accept: { [weak self] issue, r in self?.accept(issue, r) },
            dismiss: actions.dismiss,
            addWord: actions.addWord,
            rewrite: actions.rewrite,
            close: { [weak self] in self?.card.dismiss() }
        )), anchor: anchor, width: 340)
    }

    private func accept(_ issue: WireIssue, _ replacement: String) {
        guard let el = element, let text = AX.string(el, kAXValueAttribute) else { return }
        // Never overwrite text that changed since the suggestion was made.
        guard TextLogic.slice(text, offset: issue.offset, length: issue.length)
                == TextLogic.slice(issuesText, offset: issue.offset, length: issue.length) else {
            card.dismiss()
            return
        }
        let range = TextLogic.fixRange(text: text, issue: issue, replacement: replacement)
        if AX.replace(el, range: range, with: replacement, fullText: text) {
            issues.removeAll { $0.id == issue.id }
        }
        card.dismiss()
        cardIssueId = nil
        badgeKey = ""
    }

    private func requestRewrite(_ issue: WireIssue) {
        guard let original = TextLogic.slice(issuesText, offset: issue.offset, length: issue.length) else { return }
        rewriteId += 1
        let anchor = card.frame
        let pending = (NSRange(location: issue.offset, length: issue.length), original, anchor)
        pendingRewrites[rewriteId] = pending
        presentRewrite(.loading, pending: pending)
        IO.send(.rewrite(requestId: rewriteId, text: original, mode: "fix"))
    }

    private func presentRewrite(_ state: RewriteState, pending: (range: NSRange, original: String, anchor: CGRect)) {
        card.present(RewriteCard(state: state, use: { [weak self] variant in
            guard let self, let el = element, let text = AX.string(el, kAXValueAttribute) else { return }
            if TextLogic.slice(text, offset: pending.range.location, length: pending.range.length) == pending.original {
                AX.replace(el, range: pending.range, with: variant, fullText: text)
            }
            card.dismiss()
        }, close: { [weak self] in self?.card.dismiss() }), anchor: pending.anchor)
    }
}
