import CoreMedia
import Foundation

/// Recording clock in host time that excludes paused intervals. Shared by the video writer
/// (to retime samples) and the input tracker (to timestamp events) so both stay in sync.
final class RecordingClock {
    private let lock = NSLock()
    private var start: CMTime?
    private var pausedAt: CMTime?
    private(set) var pausedTotal: CMTime = .zero

    func begin(at time: CMTime) {
        lock.withLock { if start == nil { start = time } }
    }

    var hasStarted: Bool { lock.withLock { start != nil } }
    var isPaused: Bool { lock.withLock { pausedAt != nil } }

    func pause(at time: CMTime) { lock.withLock { if pausedAt == nil { pausedAt = time } } }

    func resume(at time: CMTime) {
        lock.withLock {
            guard let p = pausedAt else { return }
            pausedTotal = CMTimeAdd(pausedTotal, CMTimeSubtract(time, p))
            pausedAt = nil
        }
    }

    /// Recording-relative time for a host timestamp, or nil when paused / not started.
    func recordingTime(for host: CMTime) -> CMTime? {
        lock.withLock {
            guard let s = start, pausedAt == nil else { return nil }
            return CMTimeSubtract(CMTimeSubtract(host, s), pausedTotal)
        }
    }

    static func hostNow() -> CMTime { CMClockGetTime(CMClockGetHostTimeClock()) }
}
