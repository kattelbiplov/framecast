import AVFoundation

/// Microphone capture via AVCaptureSession into its own AAC track (kept separate from system
/// audio so each can be edited independently).
final class MicrophoneRecorder: NSObject, AVCaptureAudioDataOutputSampleBufferDelegate {
    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "framecast.mic")
    private(set) var writer: TrackWriter?
    private let clock: RecordingClock

    init(clock: RecordingClock) {
        self.clock = clock
    }

    func start(deviceId: String, outputDir: String) throws {
        guard AVCaptureDevice.authorizationStatus(for: .audio) == .authorized else { throw CaptureError.permissionDenied("microphone") }
        let device = deviceId.isEmpty ? AVCaptureDevice.default(for: .audio) : AVCaptureDevice(uniqueID: deviceId) ?? AVCaptureDevice.default(for: .audio)
        guard let device else { throw CaptureError.sourceNotFound("microphone") }
        let input = try AVCaptureDeviceInput(device: device)
        let output = AVCaptureAudioDataOutput()
        output.setSampleBufferDelegate(self, queue: queue)
        session.beginConfiguration()
        if session.canAddInput(input) { session.addInput(input) }
        if session.canAddOutput(output) { session.addOutput(output) }
        session.commitConfiguration()
        writer = try TrackWriter(url: URL(fileURLWithPath: outputDir).appendingPathComponent("microphone.m4a"), kind: .audio, kindName: "microphone", clock: clock)
        session.startRunning()
    }

    func stop() {
        session.stopRunning()
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sample: CMSampleBuffer, from connection: AVCaptureConnection) {
        // Audio must not start the clock before the first video frame; wait for it.
        guard clock.hasStarted else { return }
        writer?.append(sample)
    }
}
