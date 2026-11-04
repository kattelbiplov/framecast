# Framecast

A desktop screen recorder and intelligent video editor: record your screen, camera and voice, get automatic cursor-following zooms and polished cursor effects, add animated captions, text and annotations on a multitrack timeline, and export to MP4, MOV, WebM or GIF. Works fully offline, no account needed.

> **Status:** early (v0.1). The editor, compositor, export pipeline and Chromium capture engine run end to end. The native macOS capture helper (ScreenCaptureKit) is written but has not been built on a Mac yet. See [Roadmap](docs/ROADMAP.md).

## Features

| Area | What works today |
| --- | --- |
| **Recording** | Display/window/region capture, separate screen / mic / system-audio / webcam tracks, countdown, pause/resume, floating toolbar hidden from capture, global shortcuts, crash recovery of interrupted sessions |
| **Cursor** | Spring smoothing that still lands exactly on clicks, idle hiding, click ripple/pulse/flash, press "bounce", size/colour/style, glow, highlight, trail, spotlight, all editable after recording |
| **Auto zoom** | Zoom regions generated from clicks, cursor pauses, shortcuts and scrolls; 7 presets; follow-cursor or fixed focus; fully editable and non-destructive |
| **Editor** | Multitrack timeline: split, trim, ripple delete, move across tracks, snapping, speed, reverse, freeze frame, crop, colour, fades, transitions, grouping, keyframes, undo/redo, autosave |
| **Motion** | 15 animation presets (fade, slide, pop, bounce, elastic, typewriter, word/char reveal, kinetic, glitch, blur, 3D-style flip, draw-on…), 12 transitions, preset browser with live previews, search, favourites and drag-and-drop |
| **Captions** | Offline transcription via whisper.cpp with word timings, SRT/VTT import and export, 10 animated caption styles (word highlight, karaoke, pop, bounce, typewriter, cinematic, social…), cue editing, split, merge and sync |
| **Styling** | Gradient, animated gradient, solid, pattern, image and video backgrounds; padding, corners, shadow, border, rotation, tilt; browser, MacBook, monitor, phone and tablet mockups; 16:9, 9:16, 1:1 and 4:5 with cursor-following vertical reframing |
| **Elements** | Arrows, lines, boxes, circles, highlights, spotlights, numbered steps, callouts, images, blur and pixelate privacy regions |
| **Motion graphics** | Animated lower thirds, progress bars, notification pop-ups, bar charts, subscribe buttons and count-up counters, all editable and animatable |
| **Templates** | Built-in templates plus your own: save any project's look (canvas, frame, cursor, zoom, captions, export) and start new projects from it; saved caption styles |
| **Audio** | Per-clip volume and fades, track mute, waveforms, one-click silence removal (cuts all tracks in sync), loudness normalisation, noise reduction, music ducking on export |
| **Export** | MP4 (H.264/HEVC, VideoToolbox on macOS), MOV (ProRes, including 4444 alpha), WebM (VP9, alpha), palette-optimised GIF, audio-only; 720p to 4K; social presets; burned-in or sidecar subtitles; background queue with progress and cancel |

## Getting started

Requirements: Node 20+, npm 10+, and `ffmpeg` on your `PATH` (or set its path in Settings). Optional: [whisper.cpp](https://github.com/ggerganov/whisper.cpp) plus a ggml model for transcription.

```bash
npm install
```

```bash
npm run dev
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Electron + Vite dev server with HMR |
| `npm test` | Unit tests (Vitest) for all engines and main-process logic |
| `npm run typecheck` | Strict TypeScript across packages, main, preload and renderer |
| `npm run lint` | ESLint (type-only imports, hooks rules) |
| `npm run build` | Production bundles into `apps/desktop/out` |
| `npm run dist:mac -w @framecast/desktop` | Signed and notarised DMG (needs Apple credentials, see [Building](docs/BUILDING.md)) |

The renderer also runs in a normal browser against an in-memory mock backend with a demo project. That's handy for UI work: run `npm run dev` and open the printed Vite URL.

## Repository layout

```
apps/desktop/                 Electron application
  src/main/                   Main process: lifecycle, IPC, services (projects, recording, export, transcription…)
  src/preload/                Allow-listed, typed contextBridge API
  src/shared/ipc.ts           The IPC contract shared by all processes
  src/renderer/               React UI (home, recording setup, editor, overlay toolbar, export renderer)
packages/                     Pure TypeScript engines, no Electron or DOM dependencies (except the compositor's renderer)
  schema/                     Versioned data models (zod) and migrations
  animation/                  Easing, springs, keyframes, animation and transition presets
  cursor/                     Cursor smoothing, click and idle detection
  zoom/                       Auto-zoom generation and virtual camera
  timeline/                   Immutable editing operations, snapping, undo/redo
  subtitles/                  SRT/VTT, whisper.cpp parsing, segmentation, caption animation
  compositor/                 composeFrame(): one scene model shared by preview and export, plus a Canvas2D renderer
  export/                     ffmpeg argument and audio-graph builders, size estimates, job queue
native/macos/FramecastCapture Swift ScreenCaptureKit capture service (JSON-lines RPC)
docs/                         Product, architecture, data models, decisions, roadmap, building
```

## Documentation

- [Product requirements](docs/PRODUCT.md): personas, journeys, feature inventory (MVP / V1 / future)
- [Architecture](docs/ARCHITECTURE.md): process model, components, data flow, media pipeline, security
- [Data models](docs/DATA_MODELS.md): project manifest, recording metadata, keyframes, subtitles
- [Technology decisions](docs/DECISIONS.md): decision matrix and where we deviated from the brief
- [Roadmap](docs/ROADMAP.md): phases, acceptance criteria, non-functional targets
- [Building and releasing](docs/BUILDING.md)
