import Foundation

/// JSON-lines RPC over stdio. Requests: {"id":1,"method":"start","params":{...}}
/// Responses: {"id":1,"result":{...}} or {"id":1,"error":"..."}; events: {"event":"interaction","data":{...}}
struct RPCRequest: Decodable {
    let id: Int
    let method: String
    let params: StartParams?
}

struct StartParams: Decodable {
    let outputDir: String
    let displayId: String?
    let windowId: String?
    let region: NormalizedRect?
    let fps: Int
    let showCursor: Bool
    let captureSystemAudio: Bool
    let microphoneId: String?
    let excludeBundleIds: [String]
    let trackEvents: Bool
    let trackShortcuts: Bool
}

struct NormalizedRect: Codable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct TrackResult: Encodable {
    let kind: String
    let file: String
    let mimeType: String
    let durationMs: Double
    let startOffsetMs: Double
    let width: Int?
    let height: Int?
    let fps: Int?
    let sampleRate: Double?
}

struct StopResult: Encodable {
    let durationMs: Double
    let captureSize: [String: Int]
    let tracks: [TrackResult]
}

/// Serialized writer for stdout so responses and events never interleave mid-line.
final class Output {
    static let shared = Output()
    private let queue = DispatchQueue(label: "framecast.stdout")
    private let encoder = JSONEncoder()

    func respond<T: Encodable>(id: Int, result: T) {
        write(["id": AnyEncodable(id), "result": AnyEncodable(result)])
    }

    func respondError(id: Int, _ message: String) {
        write(["id": AnyEncodable(id), "error": AnyEncodable(message)])
    }

    func event(_ name: String, _ data: [String: AnyEncodable]) {
        write(["event": AnyEncodable(name), "data": AnyEncodable(data)])
    }

    private func write(_ object: [String: AnyEncodable]) {
        queue.async {
            guard let data = try? self.encoder.encode(object) else { return }
            FileHandle.standardOutput.write(data)
            FileHandle.standardOutput.write(Data([0x0A]))
        }
    }
}

struct AnyEncodable: Encodable {
    private let encodeFn: (Encoder) throws -> Void
    init<T: Encodable>(_ value: T) { encodeFn = value.encode }
    func encode(to encoder: Encoder) throws { try encodeFn(encoder) }
}

struct EmptyResult: Encodable {}
