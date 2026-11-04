import AVFoundation
import CoreMedia

/// Writes one media track (screen video, system audio or microphone) to its own file.
/// Samples are retimed onto the shared RecordingClock so pauses leave no gaps and all tracks
/// share a common timeline. Video uses fragmented MOV so a crash leaves a playable file.
final class TrackWriter {
    enum Kind { case video(width: Int, height: Int, fps: Int), audio }

    let url: URL
    let kindName: String
    private let writer: AVAssetWriter
    private let input: AVAssetWriterInput
    private let clock: RecordingClock
    private let queue = DispatchQueue(label: "framecast.writer")
    private var sessionStarted = false
    private var firstTime: CMTime?
    private var lastTime: CMTime = .zero
    private(set) var startOffset: CMTime = .zero
    /// Only the screen track starts the shared clock; audio arriving earlier is dropped.
    private let startsClock: Bool

    init(url: URL, kind: Kind, kindName: String, clock: RecordingClock) throws {
        self.url = url
        self.kindName = kindName
        self.clock = clock
        if case .video = kind { startsClock = true } else { startsClock = false }
        try? FileManager.default.removeItem(at: url)
        switch kind {
        case let .video(width, height, fps):
            writer = try AVAssetWriter(outputURL: url, fileType: .mov)
            writer.movieFragmentInterval = CMTime(seconds: 2, preferredTimescale: 600)
            let bitsPerPixel = 0.12
            let bitrate = Double(width * height * fps) * bitsPerPixel
            input = AVAssetWriterInput(mediaType: .video, outputSettings: [
                AVVideoCodecKey: AVVideoCodecType.h264,
                AVVideoWidthKey: width,
                AVVideoHeightKey: height,
                AVVideoCompressionPropertiesKey: [
                    AVVideoAverageBitRateKey: bitrate,
                    AVVideoExpectedSourceFrameRateKey: fps,
                    AVVideoMaxKeyFrameIntervalKey: fps * 2,
                    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                    AVVideoAllowFrameReorderingKey: false,
                ],
            ])
        case .audio:
            writer = try AVAssetWriter(outputURL: url, fileType: .m4a)
            input = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 48_000,
                AVNumberOfChannelsKey: 2,
                AVEncoderBitRateKey: 192_000,
            ])
        }
        input.expectsMediaDataInRealTime = true
        guard writer.canAdd(input) else { throw CaptureError.writerSetup(kindName) }
        writer.add(input)
        guard writer.startWriting() else { throw CaptureError.writerSetup("\(kindName): \(writer.error?.localizedDescription ?? "unknown")") }
    }

    func append(_ sample: CMSampleBuffer) {
        queue.async { [self] in
            let host = CMSampleBufferGetPresentationTimeStamp(sample)
            if startsClock { clock.begin(at: host) }
            guard let t = clock.recordingTime(for: host), t >= .zero, input.isReadyForMoreMediaData else { return }
            if !sessionStarted {
                writer.startSession(atSourceTime: t)
                sessionStarted = true
                firstTime = t
                startOffset = t
            }
            guard let retimed = sample.retimed(to: t) else { return }
            if input.append(retimed) { lastTime = t }
        }
    }

    /// Finish the file and return its duration in ms.
    func finish() async -> Double {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            queue.async { [self] in
                guard sessionStarted else {
                    writer.cancelWriting()
                    cont.resume()
                    return
                }
                input.markAsFinished()
                writer.endSession(atSourceTime: lastTime)
                writer.finishWriting { cont.resume() }
            }
        }
        guard let first = firstTime else { return 0 }
        return CMTimeGetSeconds(CMTimeSubtract(lastTime, first)) * 1000
    }
}

extension CMSampleBuffer {
    /// Copy of the sample with a new presentation time (decode time cleared).
    func retimed(to time: CMTime) -> CMSampleBuffer? {
        var timing = CMSampleTimingInfo(duration: CMSampleBufferGetDuration(self), presentationTimeStamp: time, decodeTimeStamp: .invalid)
        var out: CMSampleBuffer?
        CMSampleBufferCreateCopyWithNewTiming(allocator: kCFAllocatorDefault, sampleBuffer: self, sampleTimingEntryCount: 1, sampleTimingArray: &timing, sampleBufferOut: &out)
        return out
    }
}

enum CaptureError: LocalizedError {
    case writerSetup(String)
    case sourceNotFound(String)
    case notRecording
    case permissionDenied(String)

    var errorDescription: String? {
        switch self {
        case let .writerSetup(s): return "Could not set up writer for \(s)"
        case let .sourceNotFound(s): return "Capture source not found: \(s)"
        case .notRecording: return "No recording in progress"
        case let .permissionDenied(s): return "Permission denied: \(s)"
        }
    }
}
