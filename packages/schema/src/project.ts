import { z } from 'zod';
import { ExportSettings } from './export.js';
import { Color, Id, Ms, Size, newId } from './primitives.js';
import { MediaTrackKind } from './recording.js';
import { Background, CursorStyle, FrameStyle, WebcamStyle } from './styling.js';
import { SubtitleTrack } from './subtitles.js';
import { Timeline, type Track } from './timeline.js';

export const PROJECT_SCHEMA_VERSION = 1;
export const PROJECT_FILE_NAME = 'project.framecast.json';

export const AssetRole = z.enum([...MediaTrackKind.options, 'music', 'image', 'video', 'audio']);
export type AssetRole = z.infer<typeof AssetRole>;

/** A media file referenced by the project. Originals are never modified (non-destructive). */
export const Asset = z.object({
  id: Id,
  role: AssetRole,
  name: z.string(),
  /** Path relative to the project directory, or absolute for externally linked media. */
  path: z.string().min(1),
  mimeType: z.string(),
  durationMs: Ms.optional(),
  size: Size.optional(),
  hasAudio: z.boolean().default(false),
  /** Recording this asset came from (links to cursor/interaction metadata). */
  recordingId: Id.optional(),
  /** Cached waveform peaks (0..1) at ~100 samples/second, generated lazily. */
  waveformPath: z.string().optional(),
});
export type Asset = z.infer<typeof Asset>;

export const RecordingRef = z.object({
  id: Id,
  /** Path (relative to project dir) to the RecordingMetadata JSON. */
  metadataPath: z.string(),
});
export type RecordingRef = z.infer<typeof RecordingRef>;

export const AspectRatioPreset = z.enum(['16:9', '9:16', '1:1', '4:5', '4:3', 'custom']);
export type AspectRatioPreset = z.infer<typeof AspectRatioPreset>;

export const CanvasSettings = z.object({
  aspect: AspectRatioPreset.default('16:9'),
  /** Logical composition size; export scales from this. */
  size: Size.default({ width: 1920, height: 1080 }),
  fps: z.number().positive().max(120).default(60),
  background: Background.default({
    type: 'gradient',
    stops: [
      { offset: 0, color: '#4f46e5' },
      { offset: 1, color: '#db2777' },
    ],
    angleDeg: 135,
    animateDegPerSec: 0,
  }),
  /** Used for vertical reframing: which normalized point of the screen to keep centred. */
  reframeFocus: z.enum(['center', 'cursor']).default('cursor'),
});
export type CanvasSettings = z.infer<typeof CanvasSettings>;

export const AutoZoomSettings = z.object({
  enabled: z.boolean().default(true),
  presetId: z.string().default('smooth'),
});
export type AutoZoomSettings = z.infer<typeof AutoZoomSettings>;

export const AudioSettings = z.object({
  normalize: z.boolean().default(false),
  noiseReduction: z.boolean().default(false),
  /** Lower music tracks by this many dB while voice is present. 0 = off. */
  duckingDb: z.number().min(0).max(30).default(0),
});

export const Project = z.object({
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  id: Id,
  name: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  assets: z.array(Asset).default([]),
  recordings: z.array(RecordingRef).default([]),
  canvas: CanvasSettings.default({}),
  frame: FrameStyle.default({}),
  cursor: CursorStyle.default({}),
  webcam: WebcamStyle.default({}),
  autoZoom: AutoZoomSettings.default({}),
  audio: AudioSettings.default({}),
  timeline: Timeline,
  subtitles: z.array(SubtitleTrack).default([]),
  export: ExportSettings.default({}),
  /** Accent color used in library thumbnails. */
  color: Color.default('#6366f1'),
});
export type Project = z.infer<typeof Project>;
export type ProjectInput = z.input<typeof Project>;

export function defaultTracks(): Track[] {
  const track = (kind: Track['kind'], name: string): Track => ({
    id: newId('trk'),
    kind,
    name,
    muted: false,
    locked: false,
    hidden: false,
    volume: 1,
    items: [],
  });
  return [
    track('video', 'Screen'),
    track('video', 'Overlay'),
    track('audio', 'Microphone'),
    track('audio', 'System audio'),
    track('audio', 'Music'),
    track('zoom', 'Zoom'),
    track('graphics', 'Annotations'),
    track('text', 'Text'),
  ];
}

export function createProject(name: string, now: Date = new Date()): Project {
  const iso = now.toISOString();
  return Project.parse({
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: newId('prj'),
    name,
    createdAt: iso,
    updatedAt: iso,
    timeline: { tracks: defaultTracks() },
  } satisfies ProjectInput);
}
