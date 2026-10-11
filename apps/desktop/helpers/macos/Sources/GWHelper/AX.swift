import AppKit
import ApplicationServices

/// Thin, typed wrappers around the C Accessibility API.
enum AX {
    static func isTrusted(prompt: Bool) -> Bool {
        let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        return AXIsProcessTrustedWithOptions([key: prompt] as CFDictionary)
    }

    static func focusedElement() -> AXUIElement? {
        let system = AXUIElementCreateSystemWide()
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(system, kAXFocusedUIElementAttribute as CFString, &value) == .success,
              let v = value, CFGetTypeID(v) == AXUIElementGetTypeID() else { return nil }
        return (v as! AXUIElement)
    }

    static func attribute(_ el: AXUIElement, _ name: String) -> CFTypeRef? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(el, name as CFString, &value) == .success else { return nil }
        return value
    }

    static func string(_ el: AXUIElement, _ name: String) -> String? {
        attribute(el, name) as? String
    }

    static func isSettable(_ el: AXUIElement, _ name: String) -> Bool {
        var settable: DarwinBoolean = false
        return AXUIElementIsAttributeSettable(el, name as CFString, &settable) == .success && settable.boolValue
    }

    static func pid(_ el: AXUIElement) -> pid_t? {
        var pid: pid_t = 0
        return AXUIElementGetPid(el, &pid) == .success ? pid : nil
    }

    /// Element frame in Accessibility (top-left origin) coordinates.
    static func frame(_ el: AXUIElement) -> CGRect? {
        guard let posRef = attribute(el, kAXPositionAttribute), let sizeRef = attribute(el, kAXSizeAttribute),
              CFGetTypeID(posRef) == AXValueGetTypeID(), CFGetTypeID(sizeRef) == AXValueGetTypeID() else { return nil }
        var pos = CGPoint.zero
        var size = CGSize.zero
        AXValueGetValue(posRef as! AXValue, .cgPoint, &pos)
        AXValueGetValue(sizeRef as! AXValue, .cgSize, &size)
        return CGRect(origin: pos, size: size)
    }

    /// Screen bounds of a UTF-16 text range, if the app supports it.
    static func bounds(_ el: AXUIElement, offset: Int, length: Int) -> CGRect? {
        var range = CFRange(location: offset, length: length)
        guard let rangeValue = AXValueCreate(.cfRange, &range) else { return nil }
        var result: CFTypeRef?
        let err = AXUIElementCopyParameterizedAttributeValue(
            el, kAXBoundsForRangeParameterizedAttribute as CFString, rangeValue, &result)
        guard err == .success, let r = result, CFGetTypeID(r) == AXValueGetTypeID() else { return nil }
        var rect = CGRect.zero
        AXValueGetValue(r as! AXValue, .cgRect, &rect)
        return rect.width > 0 && rect.height > 0 ? rect : nil
    }

    /// Replaces a range the way a user would: select it, then type over it. Keeps undo in most apps.
    @discardableResult
    static func replace(_ el: AXUIElement, range: NSRange, with text: String, fullText: String) -> Bool {
        var cf = CFRange(location: range.location, length: range.length)
        if let rangeValue = AXValueCreate(.cfRange, &cf),
           AXUIElementSetAttributeValue(el, kAXSelectedTextRangeAttribute as CFString, rangeValue) == .success,
           AXUIElementSetAttributeValue(el, kAXSelectedTextAttribute as CFString, text as CFString) == .success {
            return true
        }
        // Fallback: write the whole value (loses undo, but works in simple fields).
        guard isSettable(el, kAXValueAttribute) else { return false }
        let next = (fullText as NSString).replacingCharacters(in: range, with: text)
        return AXUIElementSetAttributeValue(el, kAXValueAttribute as CFString, next as CFString) == .success
    }

    /// Electron and Chromium apps (Notion, Slack, VS Code, Discord) only build their accessibility
    /// tree when asked. This asks.
    static func enableManualAccessibility(pid: pid_t) {
        let app = AXUIElementCreateApplication(pid)
        AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue)
    }

    static let textRoles: Set<String> = [kAXTextAreaRole as String, kAXTextFieldRole as String, kAXComboBoxRole as String]

    /// True for editable text we should check. Skips password fields.
    static func isCheckable(_ el: AXUIElement) -> Bool {
        if string(el, kAXSubroleAttribute) == (kAXSecureTextFieldSubrole as String) { return false }
        guard attribute(el, kAXValueAttribute) is String else { return false }
        let role = string(el, kAXRoleAttribute) ?? ""
        return textRoles.contains(role) || isSettable(el, kAXValueAttribute)
    }
}
