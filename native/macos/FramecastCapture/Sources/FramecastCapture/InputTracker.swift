import AppKit
import CoreGraphics
import CoreMedia

/// Global, listen-only CGEventTap for cursor movement, clicks, scrolls and (optionally)
/// keyboard *shortcuts*. Plain typing is never emitted: key events are reported only while
/// ⌘, ⌃ or ⌥ is held, and only the key name — never text — leaves this process.
/// Requires the Accessibility permission (checked by the app before recording).
final class InputTracker {
    private var tap: CFMachPort?
    private var source: CFRunLoopSource?
    private var thread: Thread?
    private let clock: RecordingClock
    private let rect: CGRect
    private let trackShortcuts: Bool
    private var lastMove: CFAbsoluteTime = 0

    init(clock: RecordingClock, captureRect: CGRect, trackShortcuts: Bool) {
        self.clock = clock
        self.rect = captureRect
        self.trackShortcuts = trackShortcuts
    }

    func start() {
        var mask: CGEventMask = 0
        for type: CGEventType in [.mouseMoved, .leftMouseDragged, .rightMouseDragged, .leftMouseDown, .leftMouseUp, .rightMouseDown, .rightMouseUp, .otherMouseDown, .otherMouseUp, .scrollWheel] {
            mask |= 1 << type.rawValue
        }
        if trackShortcuts { mask |= 1 << CGEventType.keyDown.rawValue }
        let refcon = Unmanaged.passUnretained(self).toOpaque()
        guard let tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly, eventsOfInterest: mask, callback: { _, type, event, refcon in
            if let refcon { Unmanaged<InputTracker>.fromOpaque(refcon).takeUnretainedValue().handle(type: type, event: event) }
            return Unmanaged.passUnretained(event)
        }, userInfo: refcon) else {
            Output.shared.event("error", ["message": AnyEncodable("Click tracking unavailable: grant Accessibility permission to Framecast.")])
            return
        }
        self.tap = tap
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        self.source = source
        let thread = Thread {
            CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
            CGEvent.tapEnable(tap: tap, enable: true)
            CFRunLoopRun()
        }
        thread.name = "framecast.input"
        thread.start()
        self.thread = thread
    }

    func stop() {
        if let tap { CGEvent.tapEnable(tap: tap, enable: false) }
        tap = nil
        source = nil
        thread?.cancel()
    }

    private func handle(type: CGEventType, event: CGEvent) {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            if let tap { CGEvent.tapEnable(tap: tap, enable: true) }
            return
        }
        guard let t = clock.recordingTime(for: CMClockGetTime(CMClockGetHostTimeClock())) else { return }
        let ms = (CMTimeGetSeconds(t) * 1000).rounded()
        let loc = event.location // global display points, top-left origin
        let x = round4((loc.x - rect.minX) / rect.width)
        let y = round4((loc.y - rect.minY) / rect.height)

        switch type {
        case .mouseMoved, .leftMouseDragged, .rightMouseDragged:
            // Cap at ~120 Hz; the editor smooths between samples.
            let now = CFAbsoluteTimeGetCurrent()
            guard now - lastMove > 1.0 / 120 else { return }
            lastMove = now
            emit(["type": AnyEncodable("move"), "t": AnyEncodable(ms), "x": AnyEncodable(x), "y": AnyEncodable(y)])
        case .leftMouseDown, .rightMouseDown, .otherMouseDown, .leftMouseUp, .rightMouseUp, .otherMouseUp:
            let down = type == .leftMouseDown || type == .rightMouseDown || type == .otherMouseDown
            let button = (type == .leftMouseDown || type == .leftMouseUp) ? "left" : (type == .rightMouseDown || type == .rightMouseUp) ? "right" : "middle"
            emit(["type": AnyEncodable(down ? "down" : "up"), "t": AnyEncodable(ms), "x": AnyEncodable(x), "y": AnyEncodable(y), "button": AnyEncodable(button)])
        case .scrollWheel:
            let dy = event.getDoubleValueField(.scrollWheelEventPointDeltaAxis1)
            let dx = event.getDoubleValueField(.scrollWheelEventPointDeltaAxis2)
            emit(["type": AnyEncodable("scroll"), "t": AnyEncodable(ms), "x": AnyEncodable(x), "y": AnyEncodable(y), "dx": AnyEncodable(dx), "dy": AnyEncodable(dy)])
        case .keyDown:
            let flags = event.flags
            var mods: [String] = []
            if flags.contains(.maskCommand) { mods.append("cmd") }
            if flags.contains(.maskControl) { mods.append("ctrl") }
            if flags.contains(.maskAlternate) { mods.append("alt") }
            // Privacy: without a command-style modifier this is typing, not a shortcut.
            guard !mods.isEmpty else { return }
            if flags.contains(.maskShift) { mods.append("shift") }
            let code = event.getIntegerValueField(.keyboardEventKeycode)
            emit(["type": AnyEncodable("shortcut"), "t": AnyEncodable(ms), "key": AnyEncodable(keyName(code)), "modifiers": AnyEncodable(mods)])
        default:
            break
        }
    }

    private func emit(_ data: [String: AnyEncodable]) {
        Output.shared.event("interaction", data)
    }

    private func round4(_ v: CGFloat) -> Double { (Double(v) * 10_000).rounded() / 10_000 }

    /// US-layout names for virtual key codes (only used for shortcut labels).
    private func keyName(_ code: Int64) -> String {
        let map: [Int64: String] = [0: "A", 1: "S", 2: "D", 3: "F", 4: "H", 5: "G", 6: "Z", 7: "X", 8: "C", 9: "V", 11: "B", 12: "Q", 13: "W", 14: "E", 15: "R", 16: "Y", 17: "T", 31: "O", 32: "U", 34: "I", 35: "P", 37: "L", 38: "J", 40: "K", 45: "N", 46: "M", 36: "Return", 48: "Tab", 49: "Space", 51: "Delete", 53: "Esc", 123: "←", 124: "→", 125: "↓", 126: "↑"]
        if let n = map[code] { return n }
        if (18...29).contains(code) { return "Digit" }
        return "Key\(code)"
    }
}
