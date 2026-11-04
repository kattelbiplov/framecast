# Roadmap and acceptance criteria

Legend: ✅ done · 🟡 partial · ⬜ not started

## Phase 1 — Recording MVP ✅
Desktop shell, Chromium capture engine, mic/webcam/system audio, controls, local saving, project creation.
*Acceptance:* recording 5 min at 1080p30 produces seekable files and opens in the editor. Verified on Linux/Xvfb (`screen.webm` → project → 720p H.264 export).

## Phase 2 — Intelligent recording 🟡
✅ Cursor smoothing, idle hide, click effects · ✅ auto zoom (7 presets) and manual zoom · ✅ backgrounds and frame · ✅ webcam overlay · 🟡 native ScreenCaptureKit helper (written, not yet built or tested on a Mac).
*Acceptance:* in a recording with 10 clicks, ≥ 8 get a zoom with the default preset. Cursor position at click time is within 0.5% of the click (unit-tested: exact).

## Phase 3 — Video editing ✅
Timeline with split/trim/ripple/move/snapping, multitrack, persistence (atomic plus backup), snapshot undo/redo with gesture coalescing.
*Acceptance:* 200-step undo history; a drag is a single undo step; no data loss on kill -9 during save (atomic rename).

## Phase 4 — Animations and subtitles ✅
15 presets, 12 transitions, preset browser, whisper.cpp transcription, subtitle editor, 10 caption styles, word highlighting.

## Phase 5 — Advanced editing 🟡
✅ Audio normalise, denoise and ducking (export) · ✅ templates (built-in) · ✅ social presets · ⬜ user-saved presets and templates · ⬜ motion-graphics library (charts, progress bars) · ⬜ background removal.

## Phase 6 — Production release ⬜
WebCodecs/VideoToolbox fast export · Playwright E2E in CI · signing, notarisation, DMG · auto-update feed · crash reporting (opt-in).

## Non-functional targets

These are to be confirmed on representative hardware (M1 Air, M3 Pro, Intel i5 2020).

| Area | Target |
| --- | --- |
| Recording | ≥ 99% of frames delivered at 60 fps on M-series (native engine); CPU < 25% of one performance core during recording |
| A/V sync | Drift < 40 ms over 60 min |
| Preview | ≥ 50 fps at 1080p with ≤ 6 layers; scrub latency < 100 ms |
| Timeline | Interactions < 16 ms for projects with ≤ 500 items |
| Export | ≥ 1× real-time at 1080p60 (WebCodecs path); current ffmpeg-pipe path is roughly 1× at 720p |
| Crash recovery | ≤ 1 s of media and events lost on a crash during recording |
| Captions | Word timing error < 150 ms median (whisper.cpp base.en) |
| Compatibility | macOS 13+ (ScreenCaptureKit requirement) |
