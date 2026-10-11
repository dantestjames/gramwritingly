import Foundation
import GWHelperCore

/// Line-delimited JSON over stdin/stdout, talking to the Gramwritingly desktop app.
enum IO {
    private static let out = FileHandle.standardOutput
    private static let lock = NSLock()

    static func send(_ message: OutMessage) {
        let data = Data((message.line() + "\n").utf8)
        lock.lock()
        defer { lock.unlock() }
        out.write(data)
    }

    /// Reads stdin on a background thread and delivers parsed messages on the main queue.
    /// When stdin closes (the app quit), the helper exits too.
    static func listen(_ handler: @escaping (InMessage) -> Void) {
        Thread.detachNewThread {
            while let line = readLine(strippingNewline: true) {
                guard let msg = InMessage.parse(line) else { continue }
                DispatchQueue.main.async { handler(msg) }
            }
            DispatchQueue.main.async { exit(0) }
        }
    }

    static func log(_ text: String) {
        FileHandle.standardError.write(Data("[gw-helper] \(text)\n".utf8))
    }
}
