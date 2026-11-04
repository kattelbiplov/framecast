import { z } from 'zod';
import { Color, Id } from './primitives.js';

export const Background = z.discriminatedUnion('type', [
  z.object({ type: z.literal('solid'), color: Color }),
  z.object({
    type: z.literal('gradient'),
    stops: z.array(z.object({ offset: z.number().min(0).max(1), color: Color })).min(2),
    angleDeg: z.number().default(135),
    /** Animated gradients rotate their angle by this many degrees per second. */
    animateDegPerSec: z.number().default(0),
  }),
  z.object({ type: z.literal('image'), assetId: Id, blurPx: z.number().nonnegative().default(0) }),
  z.object({ type: z.literal('video'), assetId: Id, blurPx: z.number().nonnegative().default(0) }),
  z.object({
    type: z.literal('pattern'),
    pattern: z.enum(['dots', 'grid', 'diagonal']),
    color: Color,
    background: Color,
    spacingPx: z.number().positive().default(24),
  }),
]);
export type Background = z.infer<typeof Background>;

export const Shadow = z.object({
  color: Color.default('rgba(0,0,0,0.45)'),
  blurPx: z.number().nonnegative().default(40),
  offsetX: z.number().default(0),
  offsetY: z.number().default(16),
});
export type Shadow = z.infer<typeof Shadow>;

export const DeviceMockup = z.enum(['none', 'macbook', 'monitor', 'browser', 'phone', 'tablet']);
export type DeviceMockup = z.infer<typeof DeviceMockup>;

export const FrameStyle = z.object({
  /** Padding around the screen as a fraction of the canvas' shorter side. */
  padding: z.number().min(0).max(0.4).default(0.07),
  cornerRadiusPx: z.number().nonnegative().default(14),
  shadow: Shadow.nullable().default({}),
  border: z.object({ widthPx: z.number().nonnegative(), color: Color }).nullable().default(null),
  rotationDeg: z.number().default(0),
  /** Simulated perspective tilt in degrees (rendered as skew in 2D backends). */
  tiltXDeg: z.number().min(-30).max(30).default(0),
  tiltYDeg: z.number().min(-30).max(30).default(0),
  mockup: DeviceMockup.default('none'),
  /** Scale of the screen within the padded area. */
  scale: z.number().positive().default(1),
  offset: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
});
export type FrameStyle = z.infer<typeof FrameStyle>;

export const CursorStyle = z.object({
  visible: z.boolean().default(true),
  style: z.enum(['macos', 'macosWhite', 'dot', 'ring']).default('macos'),
  /** Size multiplier relative to the native cursor size. */
  size: z.number().min(0.25).max(6).default(1.5),
  color: Color.default('#000000'),
  outlineColor: Color.default('#ffffff'),
  shadow: z.boolean().default(true),
  highlight: z.object({ color: Color, radiusPx: z.number().positive() }).nullable().default(null),
  glow: z.boolean().default(false),
  trail: z.object({ lengthMs: z.number().positive(), color: Color }).nullable().default(null),
  /** 0 = raw movement, 1 = maximum smoothing. */
  smoothing: z.number().min(0).max(1).default(0.6),
  hideWhenIdle: z.boolean().default(true),
  idleTimeoutMs: z.number().positive().default(2500),
  clickEffect: z.enum(['none', 'ripple', 'pulse', 'highlight']).default('ripple'),
  clickColor: Color.default('rgba(59,130,246,0.55)'),
  clickScale: z.number().min(0.3).max(1).default(0.8),
  spotlight: z.boolean().default(false),
});
export type CursorStyle = z.infer<typeof CursorStyle>;

export const WebcamStyle = z.object({
  visible: z.boolean().default(true),
  shape: z.enum(['circle', 'rounded', 'square']).default('circle'),
  /** Width as a fraction of canvas width. */
  size: z.number().min(0.05).max(1).default(0.18),
  /** Normalized center position on the canvas. */
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0.88, y: 0.82 }),
  border: z.object({ widthPx: z.number().nonnegative(), color: Color }).nullable().default(null),
  shadow: Shadow.nullable().default({}),
  mirror: z.boolean().default(true),
  /** Shrink the webcam while the screen is zoomed in. */
  shrinkOnZoom: z.boolean().default(true),
});
export type WebcamStyle = z.infer<typeof WebcamStyle>;
