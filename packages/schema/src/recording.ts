import { z } from 'zod';
import { Id, Ms, Rect, Size } from './primitives.js';

export const RECORDING_SCHEMA_VERSION = 1;

export const CaptureSource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('display'), displayId: z.string(), name: z.string() }),
  z.object({
    kind: z.literal('window'),
    windowId: z.string(),
    name: z.string(),
    appName: z.string().optional(),
  }),
  z.object({ kind: z.literal('region'), displayId: z.string(), name: z.string(), region: Rect }),
  z.object({ kind: z.literal('none'), name: z.string().default('No screen') }),
]);
export type CaptureSource = z.infer<typeof CaptureSource>;

export const MediaTrackKind = z.enum(['screen', 'webcam', 'microphone', 'systemAudio']);
export type MediaTrackKind = z.infer<typeof MediaTrackKind>;

export const RecordedMediaTrack = z.object({
  id: Id,
  kind: MediaTrackKind,
  /** Path relative to the recording directory. */
  file: z.string().min(1),
  mimeType: z.string(),
  durationMs: Ms,
  /** Offset of this track's first sample relative to the recording clock (for A/V sync). */
  startOffsetMs: z.number().finite().default(0),
  size: Size.optional(),
  fps: z.number().positive().optional(),
  sampleRate: z.number().positive().optional(),
  deviceLabel: z.string().optional(),
});
export type RecordedMediaTrack = z.infer<typeof RecordedMediaTrack>;

export const MouseButton = z.enum(['left', 'right', 'middle']);

/**
 * Interaction events. x/y are normalized (0..1) relative to the captured surface so they
 * survive resolution changes. `t` is ms on the recording clock, pauses already removed.
 */
export const InteractionEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'), t: Ms, x: z.number(), y: z.number() }),
  z.object({ type: z.literal('down'), t: Ms, x: z.number(), y: z.number(), button: MouseButton }),
  z.object({ type: z.literal('up'), t: Ms, x: z.number(), y: z.number(), button: MouseButton }),
  z.object({
    type: z.literal('scroll'),
    t: Ms,
    x: z.number(),
    y: z.number(),
    dx: z.number(),
    dy: z.number(),
  }),
  /**
   * Keyboard *shortcuts* only. Plain typing is never stored (privacy): the native tracker only
   * emits key events when a command/control/option modifier is held.
   */
  z.object({
    type: z.literal('shortcut'),
    t: Ms,
    key: z.string().max(16),
    modifiers: z.array(z.enum(['cmd', 'ctrl', 'alt', 'shift', 'fn'])),
  }),
  z.object({ type: z.literal('cursorShape'), t: Ms, shape: z.string() }),
]);
export type InteractionEvent = z.infer<typeof InteractionEvent>;

export const PauseSpan = z.object({ atMs: Ms, wallDurationMs: Ms });

export const RecordingMetadata = z.object({
  schemaVersion: z.literal(RECORDING_SCHEMA_VERSION),
  id: Id,
  createdAt: z.string().datetime(),
  appVersion: z.string(),
  engine: z.enum(['screencapturekit', 'chromium']),
  source: CaptureSource,
  captureSize: Size.optional(),
  durationMs: Ms,
  tracks: z.array(RecordedMediaTrack),
  /** True when the OS cursor is baked into the screen video (cursor effects then limited). */
  cursorBakedIn: z.boolean(),
  events: z.array(InteractionEvent),
  pauses: z.array(PauseSpan).default([]),
  /** Set when the recording was salvaged after a crash. */
  recovered: z.boolean().default(false),
});
export type RecordingMetadata = z.infer<typeof RecordingMetadata>;
