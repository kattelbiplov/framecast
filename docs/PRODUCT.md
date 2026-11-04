# Product requirements (condensed PRD)

## Vision

Anyone can turn a raw screen recording into a polished, professional video in minutes, offline and without editing skills, while experts keep full control over every effect.

## Personas

| Persona | Goal | Key needs |
| --- | --- | --- |
| **Dev advocate Dana** | Ship feature demos and tutorials weekly | Auto zoom, cursor polish, code-friendly typography, fast export to YouTube and X |
| **Founder Femi** | Product demos for the landing page and sales | Device mockups, brand backgrounds, captions on by default, 9:16 cuts for social |
| **Educator Eli** | Course lessons of 10–40 min | Reliable long recordings, pause/resume, webcam overlay, accurate subtitles (SRT for the LMS) |
| **Marketer Mia** | Short social clips | Social caption styles, vertical reframing, templates, GIFs |

## Core journeys

1. **Record → share in five minutes.** Home → New recording → pick display → Start (countdown) → work → Stop. The editor opens with zooms, smoothed cursor and styled frame already applied → Export → YouTube 1080p.
2. **Polish a demo.** Open project → adjust auto zooms (disable one, retime another, change preset) → add title and callouts → caption style "Word highlight" → export MP4 plus SRT.
3. **Repurpose to vertical.** Duplicate project → aspect 9:16 (the cursor-following reframe keeps the action centred) → Social captions → export TikTok preset.
4. **Recover from a crash.** Relaunch → "An interrupted recording was found" → Recover → editor with everything up to the last second.

## Feature inventory

**MVP (done in v0.1, except where marked)**

- Recording: display, region and window capture, mic, webcam, system audio
- Countdown, pause/resume, floating toolbar, global shortcuts
- Local project storage and autosave
- Editor: multitrack timeline, trim, split, move, speed, undo/redo, preview
- Cursor smoothing and click effects; automatic and manual zoom
- Backgrounds, frame styling, mockups, aspect ratios
- Text with animation presets, annotations and privacy regions
- Captions: whisper.cpp transcription, SRT/VTT, 10 animated styles
- Export: MP4, MOV, WebM, GIF and audio, with social presets
- *Pending:* native helper build and testing on macOS

**V1**

- ~~Template save/load from a user's own project~~ (done)
- Custom reusable animation presets (caption presets done)
- Clip grouping UI, marker UI, ripple modes
- Playwright E2E suite in CI
- Signed and notarised builds with auto-update
- WebCodecs export fast path
- ~~Audio silence detection and auto-cut~~ (done)
- Speaker diarisation
- Camera background blur and removal (Vision framework)

**Future**

- Windows native capture (Windows.Graphics.Capture)
- Optional cloud transcription and sharing links
- Automatic sensitive-data detection (advisory only, never trusted blindly)
- Collaborative review
- Animated charts and progress bars

## Out of scope for v0.x

Accounts, cloud storage, multi-user editing.
