# Building and releasing

## Development

```bash
npm install
```

```bash
npm run dev
```

Electron starts with HMR. Running the renderer alone in a browser uses the mock backend (`renderer/src/lib/mock-bridge.ts`).

## Tests and checks

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run lint
```

## Native macOS capture helper

```bash
cd native/macos/FramecastCapture
```

```bash
swift build -c release --arch arm64 --arch x86_64
```

```bash
cp .build/apple/Products/Release/framecast-capture ../../../apps/desktop/resources/bin/
```

The app picks it up automatically (`app:info.nativeCapture`). Grant **Screen Recording** and **Accessibility** to the app (or to your terminal in development).

## ffmpeg

Place an **LGPL** ffmpeg build with VideoToolbox enabled at `apps/desktop/resources/bin/ffmpeg` for release builds. In development, ffmpeg on `PATH` is used. Exports require `libx264` on non-mac platforms, or set Hardware acceleration on macOS. GPL builds include `libx264`/`libx265`; check licensing before redistributing.

## whisper.cpp

Build `whisper-cli` and download a model (e.g. `ggml-base.en.bin`). Either set both paths in Settings → Tools, or place them in `<userData>/whisper/bin/` and `<userData>/whisper/models/`.

## Release (macOS)

Set `CSC_LINK`/`CSC_KEY_PASSWORD` (Developer ID certificate) and `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, then:

```bash
npm run dist:mac -w @framecast/desktop
```

Hardened runtime and entitlements: `apps/desktop/build/entitlements.mac.plist`.
