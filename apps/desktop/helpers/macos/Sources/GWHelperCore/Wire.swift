import Foundation

/// One suggestion as sent by the desktop app. Offsets and lengths are UTF-16 code units,
/// which is what both JavaScript strings and the Accessibility API (CFRange on NSString) use.
public struct WireIssue: Codable, Equatable {
    public var id: String
    public var offset: Int
    public var length: Int
    /// "red" | "blue" | "amber" | "purple" | "green"
    public var colour: String
    public var title: String
    public var message: String
    public var replacements: [String]
    /// True for whole-sentence issues (long sentences) that offer an AI rewrite instead of a fix.
    public var sentence: Bool

    public init(id: String, offset: Int, length: Int, colour: String, title: String, message: String, replacements: [String], sentence: Bool) {
        self.id = id
        self.offset = offset
        self.length = length
        self.colour = colour
        self.title = title
        self.message = message
        self.replacements = replacements
        self.sentence = sentence
    }

    public var end: Int { offset + length }
}

// MARK: - Helper -> app

public enum OutMessage: Encodable, Equatable {
    case ready(trusted: Bool)
    case trust(trusted: Bool)
    case text(seq: Int, app: String, appName: String, text: String)
    case focusLost
    case addWord(word: String)
    case rewrite(requestId: Int, text: String, mode: String)

    private enum Keys: String, CodingKey { case type, trusted, seq, app, appName, text, word, requestId, mode }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        switch self {
        case let .ready(trusted):
            try c.encode("ready", forKey: .type); try c.encode(trusted, forKey: .trusted)
        case let .trust(trusted):
            try c.encode("trust", forKey: .type); try c.encode(trusted, forKey: .trusted)
        case let .text(seq, app, appName, text):
            try c.encode("text", forKey: .type); try c.encode(seq, forKey: .seq)
            try c.encode(app, forKey: .app); try c.encode(appName, forKey: .appName); try c.encode(text, forKey: .text)
        case .focusLost:
            try c.encode("focus-lost", forKey: .type)
        case let .addWord(word):
            try c.encode("add-word", forKey: .type); try c.encode(word, forKey: .word)
        case let .rewrite(requestId, text, mode):
            try c.encode("rewrite", forKey: .type); try c.encode(requestId, forKey: .requestId)
            try c.encode(text, forKey: .text); try c.encode(mode, forKey: .mode)
        }
    }

    /// One JSON object per line, as written to stdout.
    public func line() -> String {
        let data = (try? JSONEncoder().encode(self)) ?? Data("{}".utf8)
        return String(decoding: data, as: UTF8.self)
    }
}

// MARK: - App -> helper

public struct HelperConfig: Codable, Equatable {
    public var enabled: Bool
    public var disabledApps: [String]

    public init(enabled: Bool = true, disabledApps: [String] = []) {
        self.enabled = enabled
        self.disabledApps = disabledApps
    }
}

public enum InMessage: Equatable {
    case config(HelperConfig)
    case issues(seq: Int, issues: [WireIssue])
    case rewriteResult(requestId: Int, variants: [String], error: String?)
    case requestTrust
    case quit

    private struct Envelope: Decodable { let type: String }
    private struct Issues: Decodable { let seq: Int; let issues: [WireIssue] }
    private struct Rewrite: Decodable { let requestId: Int; let variants: [String]?; let error: String? }

    /// Parses one line from stdin. Unknown or malformed lines return nil and are ignored.
    public static func parse(_ line: String) -> InMessage? {
        let data = Data(line.utf8)
        let decoder = JSONDecoder()
        guard let env = try? decoder.decode(Envelope.self, from: data) else { return nil }
        switch env.type {
        case "config":
            return (try? decoder.decode(HelperConfig.self, from: data)).map(InMessage.config)
        case "issues":
            return (try? decoder.decode(Issues.self, from: data)).map { .issues(seq: $0.seq, issues: $0.issues) }
        case "rewrite-result":
            return (try? decoder.decode(Rewrite.self, from: data)).map {
                .rewriteResult(requestId: $0.requestId, variants: $0.variants ?? [], error: $0.error)
            }
        case "request-trust":
            return .requestTrust
        case "quit":
            return .quit
        default:
            return nil
        }
    }
}
