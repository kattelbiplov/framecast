import AVFoundation
import Foundation

/// framecast-capture — native capture service for Framecast (macOS 13+).
/// Spawned by the Electron main process with `--rpc`; speaks JSON lines on stdin/stdout.
final class Service {
    private let clock = RecordingClock()
    private var screen: ScreenRecorder?
    private var mic: MicrophoneRecorder?
    private var input: InputTracker?
    private var fps = 60

    func handle(_ req: RPCRequest) async {
        do {
            switch req.method {
            case "start":
                guard let p = req.params else { throw CaptureError.sourceNotFound("params") }
                try await start(p)
                Output.shared.respond(id: req.id, result: EmptyResult())
            case "pause":
                clock.pause(at: RecordingClock.hostNow())
                Output.shared.respond(id: req.id, result: EmptyResult())
            case "resume":
                clock.resume(at: RecordingClock.hostNow())
                Output.shared.respond(id: req.id, result: EmptyResult())
            case "stop":
                Output.shared.respond(id: req.id, result: await stop())
            case "ping":
                Output.shared.respond(id: req.id, result: ["ok": true])
            default:
                Output.shared.respondError(id: req.id, "Unknown method \(req.method)")
            }
        } catch {
            Output.shared.respondError(id: req.id, error.localizedDescription)
        }
    }

    private func start(_ p: StartParams) async throws {
        fps = p.fps
        let screen = ScreenRecorder(clock: clock)
        screen.onError = { Output.shared.event("error", ["message": AnyEncodable($0)]) }
        try await screen.start(p)
        self.screen = screen
        if let micId = p.microphoneId {
            let mic = MicrophoneRecorder(clock: clock)
            try mic.start(deviceId: micId, outputDir: p.outputDir)
            self.mic = mic
        }
        if p.trackEvents {
            let tracker = InputTracker(clock: clock, captureRect: screen.captureRectPoints, trackShortcuts: p.trackShortcuts)
            tracker.start()
            input = tracker
        }
    }

    private func stop() async -> StopResult {
        input?.stop()
        mic?.stop()
        await screen?.stop()
        var tracks: [TrackResult] = []
        let size = screen?.captureSize ?? (0, 0)
        if let w = screen?.videoWriter {
            tracks.append(TrackResult(kind: "screen", file: "screen.mov", mimeType: "video/quicktime", durationMs: await w.finish(), startOffsetMs: 0, width: size.width, height: size.height, fps: fps, sampleRate: nil))
        }
        if let w = screen?.audioWriter {
            let d = await w.finish()
            tracks.append(TrackResult(kind: "systemAudio", file: "system-audio.m4a", mimeType: "audio/mp4", durationMs: d, startOffsetMs: CMTimeGetSeconds(w.startOffset) * 1000, width: nil, height: nil, fps: nil, sampleRate: 48_000))
        }
        if let w = mic?.writer {
            let d = await w.finish()
            tracks.append(TrackResult(kind: "microphone", file: "microphone.m4a", mimeType: "audio/mp4", durationMs: d, startOffsetMs: CMTimeGetSeconds(w.startOffset) * 1000, width: nil, height: nil, fps: nil, sampleRate: 48_000))
        }
        let duration = tracks.map(\.durationMs).max() ?? 0
        return StopResult(durationMs: duration, captureSize: ["width": size.width, "height": size.height], tracks: tracks)
    }
}

guard CommandLine.arguments.contains("--rpc") else {
    FileHandle.standardError.write("Usage: framecast-capture --rpc  (spawned by Framecast)\n".data(using: .utf8)!)
    exit(64)
}

let service = Service()
let decoder = JSONDecoder()
Task.detached {
    while let line = readLine(strippingNewline: true) {
        guard !line.isEmpty, let data = line.data(using: .utf8) else { continue }
        do {
            let req = try decoder.decode(RPCRequest.self, from: data)
            await service.handle(req)
        } catch {
            Output.shared.event("error", ["message": AnyEncodable("Bad request: \(error.localizedDescription)")])
        }
    }
    exit(0) // stdin closed: parent went away
}
RunLoop.main.run()
