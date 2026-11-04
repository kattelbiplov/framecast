import AVFoundation
import ScreenCaptureKit

/// ScreenCaptureKit capture of a display, region or window (+ optional system audio).
/// The cursor is omitted when `showCursor` is false so the editor can restyle it.
final class ScreenRecorder: NSObject, SCStreamOutput, SCStreamDelegate {
    private var stream: SCStream?
    private(set) var videoWriter: TrackWriter?
    private(set) var audioWriter: TrackWriter?
    private(set) var captureSize = (width: 0, height: 0)
    /// Captured area in global display points (for normalizing cursor coordinates).
    private(set) var captureRectPoints: CGRect = .zero
    private let clock: RecordingClock
    private let sampleQueue = DispatchQueue(label: "framecast.capture", qos: .userInteractive)
    var onError: ((String) -> Void)?

    init(clock: RecordingClock) {
        self.clock = clock
    }

    func start(_ p: StartParams) async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        let excluded = content.applications.filter { p.excludeBundleIds.contains($0.bundleIdentifier) }
        let filter: SCContentFilter
        let config = SCStreamConfiguration()
        var pointSize: CGSize
        var scale: CGFloat = 2

        if let windowId = p.windowId, let wid = UInt32(windowId) {
            guard let window = content.windows.first(where: { $0.windowID == wid }) else { throw CaptureError.sourceNotFound("window \(windowId)") }
            filter = SCContentFilter(desktopIndependentWindow: window)
            pointSize = window.frame.size
            captureRectPoints = window.frame
        } else {
            let display = content.displays.first(where: { String($0.displayID) == p.displayId }) ?? content.displays.first
            guard let display else { throw CaptureError.sourceNotFound("display \(p.displayId ?? "-")") }
            filter = SCContentFilter(display: display, excludingApplications: excluded, exceptingWindows: [])
            let mode = CGDisplayCopyDisplayMode(display.displayID)
            scale = CGFloat(mode?.pixelWidth ?? display.width) / CGFloat(display.width)
            let frame = CGDisplayBounds(display.displayID)
            if let r = p.region {
                let rect = CGRect(x: r.x * frame.width, y: r.y * frame.height, width: r.width * frame.width, height: r.height * frame.height)
                config.sourceRect = rect
                pointSize = rect.size
                captureRectPoints = rect.offsetBy(dx: frame.minX, dy: frame.minY)
            } else {
                pointSize = frame.size
                captureRectPoints = frame
            }
        }

        // Even pixel dimensions are required by H.264.
        let width = Int(pointSize.width * scale) & ~1
        let height = Int(pointSize.height * scale) & ~1
        captureSize = (width, height)
        config.width = width
        config.height = height
        config.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(p.fps))
        config.showsCursor = p.showCursor
        config.queueDepth = 6
        config.pixelFormat = kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
        config.colorSpaceName = CGColorSpace.sRGB
        config.capturesAudio = p.captureSystemAudio
        config.excludesCurrentProcessAudio = true
        config.sampleRate = 48_000
        config.channelCount = 2

        let dir = URL(fileURLWithPath: p.outputDir)
        videoWriter = try TrackWriter(url: dir.appendingPathComponent("screen.mov"), kind: .video(width: width, height: height, fps: p.fps), kindName: "screen", clock: clock)
        if p.captureSystemAudio {
            audioWriter = try TrackWriter(url: dir.appendingPathComponent("system-audio.m4a"), kind: .audio, kindName: "systemAudio", clock: clock)
        }

        let stream = SCStream(filter: filter, configuration: config, delegate: self)
        try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: sampleQueue)
        if p.captureSystemAudio { try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: sampleQueue) }
        try await stream.startCapture()
        self.stream = stream
    }

    func stop() async {
        try? await stream?.stopCapture()
        stream = nil
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sample: CMSampleBuffer, of type: SCStreamOutputType) {
        guard sample.isValid else { return }
        switch type {
        case .screen:
            // Skip idle/blank frames: only `.complete` frames carry new pixels.
            guard let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
                  let raw = attachments.first?[.status] as? Int,
                  SCFrameStatus(rawValue: raw) == .complete else { return }
            videoWriter?.append(sample)
        case .audio:
            audioWriter?.append(sample)
        default:
            break
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        onError?("Screen capture stopped: \(error.localizedDescription)")
    }
}
