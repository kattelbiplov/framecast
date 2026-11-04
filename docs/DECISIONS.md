# Technology decisions

| Layer | Brief's preference | Chosen | Why / notes |
| --- | --- | --- | --- |
| Shell | Electron | **Electron 33** | Cross-platform path to Windows; mature capture APIs (`desktopCapturer`, `setDisplayMediaRequestHandler`, `setContentProtection`) |
| UI | React + TS + Vite | **React 18, strict TS, electron-vite** | As recommended |
| Styling and components | Tailwind + Radix/shadcn | **Tailwind 3 + Radix (Slider, Dialog)**, small in-house kit | shadcn's code-gen adds little for ~10 primitives |
| State | Zustand | **Zustand 5** + snapshot `History` | Immutable project snapshots make undo/redo trivial and cheap (structural sharing) |
| Native capture | Swift + ScreenCaptureKit | **Swift helper process (JSON-lines RPC)** + Chromium fallback | A separate process isolates native crashes, needs no node-gyp/Electron ABI rebuilds, and is reusable from future native shells |
| Rendering | PixiJS | **Canvas2D compositor** (deviation) | See below |
| Animation | Custom TS engine | **Custom TS** (cubic-bezier solver, analytic springs, keyframes, presets) | Deterministic and testable |
| Encoding | FFmpeg + VideoToolbox | **FFmpeg CLI** with VideoToolbox encoders on macOS | Bundle an LGPL build; ffmpeg-static (GPL) is avoided by default |
| Transcription | whisper.cpp | **whisper.cpp CLI** (`--output-json-full`) | Offline; word timings from token offsets |
| Local DB | SQLite | **JSON library index** (deviation, for now) | See below |
| Project files | JSON manifest | **Versioned JSON + zod + migrations** | As recommended |
| Tests | Vitest + Playwright | **Vitest** (51 unit tests); Playwright drives the built app in CI-style smoke runs | Add the Playwright suite to CI next |
| Packaging and updates | electron-builder + auto-update | **electron-builder** config (hardened runtime, notarisation, generic update feed) | Update server still to be chosen |

## Canvas2D instead of PixiJS

The compositor's real requirement is *one rendering model for preview and export*. That is satisfied by the pure `composeFrame()` → `FrameScene`, independent of the drawing backend.

Canvas2D gives us text layout, `filter: blur()`, clipping, rounded rects, shadows and `OffscreenCanvas` in the export window with zero dependencies, and it renders identically in both paths. At 1080p it comfortably sustains real-time preview of the scene sizes this product produces (a handful of layers).

**Revisit when** we add GPU effects such as motion blur, real perspective, LUTs or background removal. The renderer is isolated in `compositor/src/renderer/*`, so a PixiJS/WebGL backend can be added behind the same `renderScene(target, scene, sources)` signature.

## JSON index instead of SQLite (for now)

Each project is a self-contained folder (portable, easy to back up and sync). The library index is a cache that is rebuilt from disk if lost.

`better-sqlite3` would add a native module that must be rebuilt per Electron ABI and per architecture, which is real CI and signing cost for a list of maybe a few hundred rows. `ProjectStore` hides the index behind methods (`list`, `upsertEntry`, `rebuildIndex`), so moving to SQLite (e.g. for full-text search over transcripts) is a contained change.

## Export pipeline

The current exporter renders frames in a hidden renderer and pipes raw RGBA into ffmpeg. That gives exact parity with the preview and every format ffmpeg supports, but it is bounded by per-frame seeking and an IPC copy: roughly real-time at 720p on a laptop, slower at 4K.

The planned fast path (Phase 6):

- `VideoDecoder`/`VideoEncoder` (WebCodecs) in the export renderer, so frames stay on the GPU
- An mp4 muxer
- ffmpeg kept only for GIF, ProRes and the audio mix

## Chromium fallback engine

The fallback is used on Linux and Windows, and on macOS without the helper. It records with `MediaRecorder` (VP9 WebM, 1 s chunks streamed to disk) and remuxes on stop so files are seekable.

Its limits are recorded in metadata (`cursorBakedIn: true`):

- The cursor is baked into the video.
- Only cursor *movement* is tracked (no clicks), so auto zoom relies on cursor pauses.
- Window capture has no cursor mapping.
