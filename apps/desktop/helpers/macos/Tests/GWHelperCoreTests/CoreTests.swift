import CoreGraphics
import XCTest
@testable import GWHelperCore

final class CoreTests: XCTestCase {
    func issue(_ offset: Int, _ length: Int, _ repl: [String] = ["x"]) -> WireIssue {
        WireIssue(id: "\(offset)", offset: offset, length: length, colour: "red", title: "t", message: "m", replacements: repl, sentence: false)
    }

    func testParsesIssuesMessage() {
        let line = #"{"type":"issues","seq":4,"issues":[{"id":"a","offset":0,"length":5,"colour":"red","title":"Spelling","message":"m","replacements":["There"],"sentence":false}]}"#
        guard case let .issues(seq, issues)? = InMessage.parse(line) else { return XCTFail("did not parse") }
        XCTAssertEqual(seq, 4)
        XCTAssertEqual(issues.first?.replacements, ["There"])
    }

    func testParsesHello() {
        XCTAssertEqual(InMessage.parse(#"{"type":"hello"}"#), .hello)
    }

    func testIgnoresJunk() {
        XCTAssertNil(InMessage.parse("not json"))
        XCTAssertNil(InMessage.parse(#"{"type":"mystery"}"#))
    }

    func testParsesConfigAndRewrite() {
        XCTAssertEqual(InMessage.parse(#"{"type":"config","enabled":false,"disabledApps":["com.apple.Terminal"]}"#),
                       .config(HelperConfig(enabled: false, disabledApps: ["com.apple.Terminal"])))
        XCTAssertEqual(InMessage.parse(#"{"type":"rewrite-result","requestId":2,"variants":["A"]}"#),
                       .rewriteResult(requestId: 2, variants: ["A"], error: nil))
    }

    func testEncodesTextMessage() throws {
        let line = OutMessage.text(seq: 1, app: "com.apple.Notes", appName: "Notes", text: "Hi").line()
        let obj = try JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any]
        XCTAssertEqual(obj?["type"] as? String, "text")
        XCTAssertEqual(obj?["app"] as? String, "com.apple.Notes")
        XCTAssertFalse(line.contains("\n"))
    }

    func testShiftKeepsIssuesBeforeAndAfterEdit() {
        let prev = "Their are typos here sentance."
        let next = "Hello! Their are typos here sentance."
        let shifted = TextLogic.shift([issue(0, 9), issue(21, 8)], from: prev, to: next)
        XCTAssertEqual(shifted.map(\.offset), [7, 28])
    }

    func testShiftDropsIssuesTouchingEdit() {
        let shifted = TextLogic.shift([issue(4, 3)], from: "the cat sat", to: "the dog sat")
        XCTAssertTrue(shifted.isEmpty)
    }

    func testUTF16OffsetsWithEmoji() {
        let text = "👍 colour"
        XCTAssertEqual(TextLogic.slice(text, offset: 3, length: 6), "colour")
    }

    func testFixRangeRemovesSpaceWithWord() {
        let text = "It is very good."
        let r = TextLogic.fixRange(text: text, issue: issue(6, 4), replacement: "")
        XCTAssertEqual((text as NSString).replacingCharacters(in: r, with: ""), "It is good.")
    }

    func testCoordinateFlip() {
        let r = Geometry.axToCocoa(CGRect(x: 10, y: 100, width: 50, height: 20), primaryScreenHeight: 1000)
        XCTAssertEqual(r, CGRect(x: 10, y: 880, width: 50, height: 20))
    }

    func testHitTestPrefersSmallestIssue() {
        let sentence = (length: 40, rects: [CGRect(x: 0, y: 0, width: 300, height: 20)])
        let word = (length: 5, rects: [CGRect(x: 50, y: 0, width: 40, height: 20)])
        XCTAssertEqual(Geometry.hitTest(CGPoint(x: 60, y: 10), issues: [sentence, word]), 1)
        XCTAssertEqual(Geometry.hitTest(CGPoint(x: 200, y: 10), issues: [sentence, word]), 0)
        XCTAssertNil(Geometry.hitTest(CGPoint(x: 500, y: 10), issues: [sentence, word]))
    }

    func testChangeTrackerWaitsForTypingToSettle() {
        var t = ChangeTracker(settle: 0.6)
        XCTAssertNil(t.update("a", now: 0))
        XCTAssertNil(t.update("ab", now: 0.3))
        XCTAssertNil(t.update("ab", now: 0.5))
        XCTAssertEqual(t.update("ab", now: 1.0), "ab")
        XCTAssertNil(t.update("ab", now: 2.0), "should not resend unchanged text")
    }
}
