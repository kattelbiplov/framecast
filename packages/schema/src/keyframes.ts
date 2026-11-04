import { z } from 'zod';
import { Easing } from './easing.js';
import { Id, Ms } from './primitives.js';

export const AnimatableProperty = z.enum([
  'x',
  'y',
  'scale',
  'scaleX',
  'scaleY',
  'rotation',
  'opacity',
  'blur',
]);
export type AnimatableProperty = z.infer<typeof AnimatableProperty>;

/** A keyframe; `t` is relative to the owning item's start. `easing` applies to the segment that ends at this keyframe. */
export const Keyframe = z.object({
  id: Id,
  t: Ms,
  value: z.number().finite(),
  easing: Easing.default('easeInOut'),
});
export type Keyframe = z.infer<typeof Keyframe>;

export const KeyframeTracks = z.record(AnimatableProperty, z.array(Keyframe)).default({});
export type KeyframeTracks = z.infer<typeof KeyframeTracks>;

export const AnimationDirection = z.enum(['left', 'right', 'up', 'down', 'none']);
export type AnimationDirection = z.infer<typeof AnimationDirection>;

/** A reference to a reusable animation preset with user overrides. */
export const AnimationRef = z.object({
  presetId: z.string().min(1),
  durationMs: Ms.default(400),
  delayMs: Ms.default(0),
  speed: z.number().positive().default(1),
  direction: AnimationDirection.default('none'),
  easing: Easing.optional(),
  /** Free-form numeric parameters understood by the preset (e.g. distance, overshoot). */
  params: z.record(z.string(), z.number()).default({}),
});
export type AnimationRef = z.infer<typeof AnimationRef>;

/** 2D transform in canvas-normalized space (0..1 of the output canvas). */
export const Transform = z.object({
  x: z.number().default(0.5),
  y: z.number().default(0.5),
  scale: z.number().positive().default(1),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
});
export type Transform = z.infer<typeof Transform>;
