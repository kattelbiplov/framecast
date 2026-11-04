import { z } from 'zod';

export const EasingPresetName = z.enum([
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
  'easeOutCubic',
  'easeInOutCubic',
  'easeOutQuint',
  'easeOutBack',
  'easeOutElastic',
  'easeOutBounce',
  'step',
]);
export type EasingPresetName = z.infer<typeof EasingPresetName>;

export const Easing = z.union([
  EasingPresetName,
  z.object({
    type: z.literal('cubicBezier'),
    x1: z.number().min(0).max(1),
    y1: z.number(),
    x2: z.number().min(0).max(1),
    y2: z.number(),
  }),
  z.object({
    type: z.literal('spring'),
    stiffness: z.number().positive(),
    damping: z.number().nonnegative(),
    mass: z.number().positive().default(1),
  }),
]);
export type Easing = z.infer<typeof Easing>;
