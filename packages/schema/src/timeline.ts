import { z } from 'zod';
import { Easing } from './easing.js';
import { AnimationRef, KeyframeTracks, Transform } from './keyframes.js';
import { Color, Id, Ms, Vec2 } from './primitives.js';

const ItemBase = z.object({
  id: Id,
  /** Start on the timeline (ms). */
  start: Ms,
  duration: Ms.refine((d) => d > 0, 'duration must be positive'),
  groupId: Id.optional(),
});

export const Transition = z.object({
  presetId: z.string(),
  durationMs: Ms.default(500),
  easing: Easing.default('easeInOut'),
});
export type Transition = z.infer<typeof Transition>;

export const ClipItem = ItemBase.extend({
  type: z.literal('clip'),
  assetId: Id,
  /** Position inside the source media where this clip begins (ms). */
  sourceIn: Ms.default(0),
  /** Playback rate. Duration on the timeline = source span / speed. */
  speed: z.number().positive().max(16).default(1),
  reverse: z.boolean().default(false),
  /** Hold a single source frame for the clip duration. */
  freezeFrame: z.boolean().default(false),
  volume: z.number().min(0).max(4).default(1),
  muted: z.boolean().default(false),
  fadeInMs: Ms.default(0),
  fadeOutMs: Ms.default(0),
  transitionIn: Transition.nullable().default(null),
  /** Crop as normalized insets of the source frame. */
  crop: z
    .object({ top: z.number(), right: z.number(), bottom: z.number(), left: z.number() })
    .default({ top: 0, right: 0, bottom: 0, left: 0 }),
  color: z
    .object({
      brightness: z.number().default(1),
      contrast: z.number().default(1),
      saturation: z.number().default(1),
    })
    .default({}),
  keyframes: KeyframeTracks,
});
export type ClipItem = z.infer<typeof ClipItem>;

export const ZoomFocus = z.discriminatedUnion('mode', [
  /** Center follows the (smoothed) cursor while the zoom is active. */
  z.object({ mode: z.literal('followCursor') }),
  /** Fixed normalized point on the screen recording. */
  z.object({ mode: z.literal('fixed'), point: Vec2 }),
]);
export type ZoomFocus = z.infer<typeof ZoomFocus>;

export const ZoomItem = ItemBase.extend({
  type: z.literal('zoom'),
  scale: z.number().min(1).max(8).default(2),
  focus: ZoomFocus.default({ mode: 'followCursor' }),
  /** Duration of the zoom-in and zoom-out transitions (ms). 0 = instant. */
  transitionInMs: Ms.default(700),
  transitionOutMs: Ms.default(700),
  easing: Easing.default('easeInOutCubic'),
  origin: z.enum(['auto', 'manual']).default('manual'),
  disabled: z.boolean().default(false),
});
export type ZoomItem = z.infer<typeof ZoomItem>;

export const TextStyle = z.object({
  fontFamily: z.string().default('Inter'),
  fontSizePx: z.number().positive().default(64),
  fontWeight: z.number().int().min(100).max(900).default(700),
  color: Color.default('#ffffff'),
  align: z.enum(['left', 'center', 'right']).default('center'),
  lineHeight: z.number().positive().default(1.2),
  letterSpacingPx: z.number().default(0),
  background: Color.nullable().default(null),
  backgroundPaddingPx: z.number().nonnegative().default(16),
  backgroundRadiusPx: z.number().nonnegative().default(12),
  stroke: z.object({ color: Color, widthPx: z.number().positive() }).nullable().default(null),
  shadow: z
    .object({ color: Color, blurPx: z.number(), offsetX: z.number(), offsetY: z.number() })
    .nullable()
    .default(null),
});
export type TextStyle = z.infer<typeof TextStyle>;

export const TextItem = ItemBase.extend({
  type: z.literal('text'),
  text: z.string(),
  style: TextStyle.default({}),
  transform: Transform.default({}),
  animationIn: AnimationRef.nullable().default(null),
  animationOut: AnimationRef.nullable().default(null),
  keyframes: KeyframeTracks,
});
export type TextItem = z.infer<typeof TextItem>;

export const ShapeKind = z.enum([
  'arrow',
  'line',
  'rectangle',
  'ellipse',
  'highlight',
  'spotlight',
  'blur',
  'pixelate',
  'step',
  'callout',
  'image',
]);
export type ShapeKind = z.infer<typeof ShapeKind>;

/** Annotation / graphic element. Geometry is normalized to the output canvas. */
export const ShapeItem = ItemBase.extend({
  type: z.literal('shape'),
  shape: ShapeKind,
  /** Bounding box (rect shapes) or start→end (arrow/line) in canvas-normalized coordinates. */
  from: Vec2,
  to: Vec2,
  fill: Color.nullable().default(null),
  stroke: Color.default('#ff3b30'),
  strokeWidthPx: z.number().nonnegative().default(6),
  cornerRadiusPx: z.number().nonnegative().default(8),
  /** Blur radius / pixel size for privacy shapes; label number for 'step'; text for 'callout'. */
  amount: z.number().nonnegative().default(12),
  label: z.string().default(''),
  assetId: Id.optional(),
  transform: Transform.default({}),
  animationIn: AnimationRef.nullable().default(null),
  animationOut: AnimationRef.nullable().default(null),
  keyframes: KeyframeTracks,
});
export type ShapeItem = z.infer<typeof ShapeItem>;

export const GraphicKind = z.enum(['lowerThird', 'progressBar', 'notification', 'barChart', 'subscribe', 'counter']);
export type GraphicKind = z.infer<typeof GraphicKind>;

/**
 * Parametric motion graphic with a built-in, time-driven animation (lower thirds, charts…).
 * `transform.x/y` anchor the graphic on the canvas; entrance/exit presets layer on top.
 */
export const GraphicItem = ItemBase.extend({
  type: z.literal('graphic'),
  kind: GraphicKind,
  title: z.string().default(''),
  subtitle: z.string().default(''),
  /** Data for charts / counters. */
  values: z.array(z.number().finite()).default([]),
  labels: z.array(z.string()).default([]),
  primaryColor: Color.default('#6366f1'),
  secondaryColor: Color.default('#ffffff'),
  textColor: Color.default('#ffffff'),
  fontFamily: z.string().default('Inter'),
  transform: Transform.default({}),
  animationIn: AnimationRef.nullable().default(null),
  animationOut: AnimationRef.nullable().default(null),
  keyframes: KeyframeTracks,
});
export type GraphicItem = z.infer<typeof GraphicItem>;

export const TimelineItem = z.discriminatedUnion('type', [ClipItem, ZoomItem, TextItem, ShapeItem, GraphicItem]);
export type TimelineItem = z.infer<typeof TimelineItem>;
export type TimelineItemType = TimelineItem['type'];

export const TrackKind = z.enum(['video', 'audio', 'zoom', 'text', 'graphics']);
export type TrackKind = z.infer<typeof TrackKind>;

/** Which item types each track kind accepts. */
export const TRACK_ACCEPTS: Record<TrackKind, readonly TimelineItemType[]> = {
  video: ['clip'],
  audio: ['clip'],
  zoom: ['zoom'],
  text: ['text'],
  graphics: ['shape', 'graphic'],
};

export const Track = z.object({
  id: Id,
  kind: TrackKind,
  name: z.string(),
  muted: z.boolean().default(false),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  /** Track volume multiplier (audio/video tracks). */
  volume: z.number().min(0).max(4).default(1),
  items: z.array(TimelineItem).default([]),
});
export type Track = z.infer<typeof Track>;

export const Marker = z.object({ id: Id, t: Ms, label: z.string(), color: Color.default('#f59e0b') });
export type Marker = z.infer<typeof Marker>;

export const Timeline = z.object({
  /** Tracks are ordered bottom → top for compositing (index 0 is drawn first). */
  tracks: z.array(Track),
  markers: z.array(Marker).default([]),
});
export type Timeline = z.infer<typeof Timeline>;
