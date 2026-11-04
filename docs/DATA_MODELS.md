# Data models

All models are defined once, as zod schemas in [`packages/schema`](../packages/schema/src). TypeScript types are inferred from them, and the same schemas validate data at every trust boundary: loading files, IPC from renderers, and native helper events.

**Conventions**

- Times are milliseconds.
- Positions are normalised (0–1). Interaction coordinates are relative to the captured surface; overlay geometry is relative to the output canvas.
- Pixel sizes (font sizes, radii) are in *logical canvas pixels* of `project.canvas.size`. Export scales them uniformly.

## Project manifest: `project.framecast.json`

```jsonc
{
  "schemaVersion": 1,                 // bump + add a migration in migrations.ts
  "id": "prj_…", "name": "Onboarding demo", "createdAt": "…", "updatedAt": "…",
  "assets": [                         // originals are referenced, never modified
    { "id": "ast_1", "role": "screen", "path": "recordings/rec_1/screen.mov", "mimeType": "video/quicktime",
      "durationMs": 61234, "size": { "width": 2880, "height": 1800 }, "hasAudio": false, "recordingId": "rec_1" }
  ],
  "recordings": [{ "id": "rec_1", "metadataPath": "recordings/rec_1/metadata.json" }],
  "canvas":  { "aspect": "16:9", "size": { "width": 1920, "height": 1080 }, "fps": 60,
               "background": { "type": "gradient", "stops": [...], "angleDeg": 135, "animateDegPerSec": 0 },
               "reframeFocus": "cursor" },
  "frame":   { "padding": 0.07, "cornerRadiusPx": 14, "shadow": {...}, "mockup": "none", ... },
  "cursor":  { "style": "macos", "size": 1.5, "smoothing": 0.6, "clickEffect": "ripple", ... },
  "webcam":  { "shape": "circle", "size": 0.18, "position": { "x": 0.88, "y": 0.82 }, ... },
  "autoZoom": { "enabled": true, "presetId": "smooth" },
  "audio":   { "normalize": false, "noiseReduction": false, "duckingDb": 0 },
  "timeline": { "tracks": [ /* Track[] — index 0 composited first */ ], "markers": [] },
  "subtitles": [ /* SubtitleTrack[] */ ],
  "export":  { "format": "mp4", "height": 1080, "fps": 60, "quality": "high", ... }
}
```

### Timeline

`Track { id, kind: video|audio|zoom|text|graphics, name, muted, locked, hidden, volume, items[] }`. Each kind accepts specific item types (`TRACK_ACCEPTS`). Items on the same track never overlap; the timeline engine enforces this.

| Item | Key fields |
| --- | --- |
| `clip` | `assetId, start, duration, sourceIn, speed, reverse, freezeFrame, volume, fadeInMs/OutMs, transitionIn, crop, color, keyframes` |
| `zoom` | `scale, focus: followCursor \| fixed{point}, transitionInMs/OutMs, easing, origin: auto\|manual, disabled` |
| `text` | `text, style (font, colour, background, stroke, shadow…), transform, animationIn/Out, keyframes` |
| `shape` | `shape (arrow, rectangle, blur, pixelate, step, callout, image…), from, to, stroke, fill, amount, label, animationIn/Out, keyframes` |
| `graphic` | `kind (lowerThird, progressBar, notification, barChart, subscribe, counter), title, subtitle, values, labels, colours, transform, animationIn/Out, keyframes`; the built-in animation is driven by local time |

The first video track is the **screen** layer: it receives frame styling, the virtual camera, the cursor and the linked webcam. Further video tracks are free overlays.

## Recording metadata: `recordings/<id>/metadata.json`

```jsonc
{
  "schemaVersion": 1, "id": "rec_1", "createdAt": "…", "appVersion": "0.1.0",
  "engine": "screencapturekit",                  // or "chromium"
  "source": { "kind": "region", "displayId": "1", "name": "Built-in", "region": { "x": 0, "y": 0, "width": 0.5, "height": 1 } },
  "captureSize": { "width": 2880, "height": 1800 },
  "durationMs": 61234,
  "tracks": [ { "id": "…", "kind": "screen|webcam|microphone|systemAudio", "file": "screen.mov",
                "mimeType": "…", "durationMs": 61234, "startOffsetMs": 0, "size": {…}, "fps": 60 } ],
  "cursorBakedIn": false,
  "events": [                                     // recording clock, pauses removed
    { "type": "move",  "t": 16,   "x": 0.412, "y": 0.233 },
    { "type": "down",  "t": 5120, "x": 0.41,  "y": 0.22, "button": "left" },
    { "type": "up",    "t": 5190, "x": 0.41,  "y": 0.22, "button": "left" },
    { "type": "scroll","t": 7000, "x": 0.5,   "y": 0.5,  "dx": 0, "dy": -12 },
    { "type": "shortcut","t": 9000, "key": "C", "modifiers": ["cmd"] },   // never plain typing
    { "type": "cursorShape", "t": 9100, "shape": "ibeam" }
  ],
  "pauses": [ { "atMs": 30000, "wallDurationMs": 4200 } ],
  "recovered": false
}
```

Metadata is kept out of the manifest because events can run to hundreds of thousands of entries. Autosaves stay small.

## Animation and keyframes

```ts
Easing = 'linear' | 'easeInOut' | 'easeOutBack' | … | { type: 'cubicBezier', x1, y1, x2, y2 } | { type: 'spring', stiffness, damping, mass }
Keyframe = { id, t /* ms relative to item start */, value, easing /* into this key */ }
KeyframeTracks = Partial<Record<'x'|'y'|'scale'|'scaleX'|'scaleY'|'rotation'|'opacity'|'blur', Keyframe[]>>
AnimationRef = { presetId, durationMs, delayMs, speed, direction, easing?, params }   // reusable preset + overrides
```

Presets ([`animation/presets.ts`](../packages/animation/src/presets.ts)) are functions from progress to an `AnimationPose` (offset, scale, rotation, opacity, blur, reveal and per-unit stagger). Exits run the entrance backwards. Keyframes and preset poses compose.

## Subtitles

```ts
SubtitleTrack = { id, language, label, visible, burnIn, source: transcription|import|manual, style: CaptionStyle, cues: SubtitleCue[] }
SubtitleCue   = { id, start, end, text, words: { text, start, end, confidence? }[], speaker? }
CaptionStyle  = { preset: classic|wordHighlight|karaoke|pop|bounce|typewriter|cinematic|social|minimal|custom,
                  fontFamily, fontSizePx, fontWeight, textColor, activeWordColor, backgroundColor, stroke, shadow,
                  positionY, align, lineSpacing, letterSpacingPx, uppercase, animationSpeed, wordsPerLine, maxLines, safeAreaX }
```

Cue times are timeline times. When word timings are missing (imported SRT), words are distributed by character length so every animated style still works.

## Settings: `<userData>/settings.json`

Theme, library location, recording defaults, privacy toggles, excluded bundle IDs, global shortcuts, and tool paths (ffmpeg, whisper.cpp). See [`schema/settings.ts`](../packages/schema/src/settings.ts).

## Templates: `<userData>/templates/<id>.json`

`ProjectTemplate { schemaVersion, id, name, createdAt, canvas, frame, cursor, webcam, autoZoom, audio, export, captionStyle }`. A template is a project's *look* without media, timeline or caption text. Media backgrounds fall back to the default gradient because they aren't portable. See [`schema/template.ts`](../packages/schema/src/template.ts) (`extractTemplate` / `applyTemplate`).
