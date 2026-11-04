# framecast-capture (macOS)

Native capture service used by Framecast on macOS 13+.

- **ScreenCaptureKit** for display / region / window capture, with the cursor optionally omitted
  (`showsCursor = false`) so the editor can render a restylable cursor.
- **AVAssetWriter + VideoToolbox** (hardware H.264) into fragmented MOV — a crash leaves a playable file.
- **System audio** (ScreenCaptureKit) and **microphone** (AVCaptureSession) as separate AAC tracks.
- **CGEventTap** (listen-only) for cursor moves, clicks, scrolls and modifier shortcuts.
  Plain typing is never recorded.
- One shared, pause-aware `RecordingClock` timestamps video, audio and input events.

## Build

```bash
swift build -c release --arch arm64 --arch x86_64
cp .build/apple/Products/Release/framecast-capture ../../../apps/desktop/resources/bin/
```

The Electron app detects `resources/bin/framecast-capture` and uses it automatically; without it,
Framecast falls back to the Chromium capture engine.

## Protocol

JSON lines over stdio (see `Sources/FramecastCapture/Protocol.swift` and
`apps/desktop/src/main/services/capture/native-bridge.ts`):

```
→ {"id":1,"method":"start","params":{"outputDir":"…","displayId":"1","fps":60,"showCursor":false,…}}
← {"id":1,"result":{}}
← {"event":"interaction","data":{"type":"down","t":5123,"x":0.41,"y":0.22,"button":"left"}}
→ {"id":2,"method":"stop"}
← {"id":2,"result":{"durationMs":…,"captureSize":{…},"tracks":[…]}}
```

## Status

Written against the macOS 13 SDK APIs but **not yet compiled or tested on hardware** in this
repository's CI (the reference CI runs on Linux). Treat it as a first implementation to validate
on a Mac: build, grant Screen Recording + Accessibility, and run the app's recording flow.
