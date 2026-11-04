import type { AnimationDirection, AnimationRef, Easing } from '@framecast/schema';
import { ease } from './easing.js';
import { clamp, hash01, lerp } from './math.js';

/**
 * A pose delta produced by an animation preset. Offsets are fractions of the canvas
 * (dx = 0.1 → 10% of canvas width). Neutral pose = all defaults.
 */
export interface AnimationPose {
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
  opacity: number;
  blurPx: number;
  /** Fraction (0..1) of text units revealed (typewriter/word reveal). */
  reveal: number;
  revealUnit: 'none' | 'char' | 'word';
  /** Per-unit stagger: each unit gets its own sub-progress and pose (pop/bounce per word). */
  perUnit: ((unitProgress: number) => Partial<AnimationPose>) | null;
}

export const NEUTRAL_POSE: Readonly<AnimationPose> = Object.freeze({
  dx: 0,
  dy: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
  blurPx: 0,
  reveal: 1,
  revealUnit: 'none',
  perUnit: null,
});

export type PresetCategory = 'basic' | 'text' | 'emphasis' | 'graphic';

export interface AnimationPreset {
  id: string;
  name: string;
  category: PresetCategory;
  defaultDurationMs: number;
  defaultEasing: Easing;
  supportsDirection: boolean;
  /**
   * Pose at progress p ∈ [0,1] for an *entrance* (0 = hidden, 1 = settled). Exits are
   * evaluated by running the entrance backwards.
   */
  pose(p: number, ctx: { direction: AnimationDirection; params: Record<string, number> }): Partial<AnimationPose>;
}

const dirVector = (d: AnimationDirection): [number, number] => {
  switch (d) {
    case 'left':
      return [-1, 0];
    case 'right':
      return [1, 0];
    case 'up':
      return [0, -1];
    case 'down':
      return [0, 1];
    default:
      return [0, 1];
  }
};

const define = (p: AnimationPreset): AnimationPreset => p;

export const ANIMATION_PRESETS: readonly AnimationPreset[] = [
  define({
    id: 'fade',
    name: 'Fade',
    category: 'basic',
    defaultDurationMs: 400,
    defaultEasing: 'easeInOut',
    supportsDirection: false,
    pose: (p) => ({ opacity: p }),
  }),
  define({
    id: 'slide',
    name: 'Slide',
    category: 'basic',
    defaultDurationMs: 500,
    defaultEasing: 'easeOutCubic',
    supportsDirection: true,
    pose: (p, { direction, params }) => {
      const [vx, vy] = dirVector(direction);
      const dist = params.distance ?? 0.08;
      // Enter *from* the direction: offset is opposite of travel.
      return { dx: -vx * dist * (1 - p), dy: -vy * dist * (1 - p), opacity: clamp(p * 1.6) };
    },
  }),
  define({
    id: 'scale',
    name: 'Scale',
    category: 'basic',
    defaultDurationMs: 450,
    defaultEasing: 'easeOutCubic',
    supportsDirection: false,
    pose: (p, { params }) => ({ scale: lerp(params.from ?? 0.6, 1, p), opacity: clamp(p * 1.5) }),
  }),
  define({
    id: 'pop',
    name: 'Pop',
    category: 'emphasis',
    defaultDurationMs: 420,
    defaultEasing: 'easeOutBack',
    supportsDirection: false,
    pose: (p) => ({ scale: lerp(0.3, 1, p), opacity: clamp(p * 3) }),
  }),
  define({
    id: 'bounce',
    name: 'Bounce',
    category: 'emphasis',
    defaultDurationMs: 700,
    defaultEasing: 'easeOutBounce',
    supportsDirection: false,
    pose: (p) => ({ dy: -0.12 * (1 - p), opacity: clamp(p * 4) }),
  }),
  define({
    id: 'elastic',
    name: 'Elastic',
    category: 'emphasis',
    defaultDurationMs: 900,
    defaultEasing: 'easeOutElastic',
    supportsDirection: false,
    pose: (p) => ({ scale: Math.max(0, p), opacity: clamp(p * 4) }),
  }),
  define({
    id: 'blurReveal',
    name: 'Blur reveal',
    category: 'basic',
    defaultDurationMs: 600,
    defaultEasing: 'easeOut',
    supportsDirection: false,
    pose: (p, { params }) => ({ blurPx: (params.blur ?? 24) * (1 - p), opacity: p, scale: lerp(1.08, 1, p) }),
  }),
  define({
    id: 'rotate',
    name: 'Rotate in',
    category: 'basic',
    defaultDurationMs: 600,
    defaultEasing: 'easeOutBack',
    supportsDirection: false,
    pose: (p, { params }) => ({ rotation: (params.degrees ?? -25) * (1 - p), opacity: p, scale: lerp(0.8, 1, p) }),
  }),
  define({
    id: 'flip3d',
    name: '3D flip',
    category: 'text',
    defaultDurationMs: 700,
    defaultEasing: 'easeOutCubic',
    supportsDirection: false,
    // 2D approximation of a Y-axis flip: horizontal squash plus perspective drift.
    pose: (p) => ({ scale: lerp(0.5, 1, p), dy: 0.03 * (1 - p), rotation: 8 * (1 - p), opacity: p }),
  }),
  define({
    id: 'typewriter',
    name: 'Typewriter',
    category: 'text',
    defaultDurationMs: 1200,
    defaultEasing: 'linear',
    supportsDirection: false,
    pose: (p) => ({ reveal: p, revealUnit: 'char' }),
  }),
  define({
    id: 'wordReveal',
    name: 'Word by word',
    category: 'text',
    defaultDurationMs: 1000,
    defaultEasing: 'linear',
    supportsDirection: false,
    pose: (p) => ({
      reveal: p,
      revealUnit: 'word',
      perUnit: (u) => ({ opacity: u, dy: 0.015 * (1 - ease('easeOutCubic', u)) }),
    }),
  }),
  define({
    id: 'charPop',
    name: 'Character pop',
    category: 'text',
    defaultDurationMs: 900,
    defaultEasing: 'linear',
    supportsDirection: false,
    pose: (p) => ({
      reveal: p,
      revealUnit: 'char',
      perUnit: (u) => ({ scale: lerp(0.2, 1, ease('easeOutBack', u)), opacity: clamp(u * 3) }),
    }),
  }),
  define({
    id: 'kinetic',
    name: 'Kinetic',
    category: 'text',
    defaultDurationMs: 1100,
    defaultEasing: 'linear',
    supportsDirection: true,
    pose: (p, { direction }) => {
      const [vx, vy] = dirVector(direction);
      return {
        reveal: p,
        revealUnit: 'word',
        perUnit: (u) => {
          const e = ease('easeOutQuint', u);
          return { dx: -vx * 0.05 * (1 - e), dy: -vy * 0.05 * (1 - e), scale: lerp(1.6, 1, e), opacity: clamp(u * 2) };
        },
      };
    },
  }),
  define({
    id: 'glitch',
    name: 'Glitch',
    category: 'text',
    defaultDurationMs: 600,
    defaultEasing: 'linear',
    supportsDirection: false,
    pose: (p) => {
      const step = Math.floor(p * 24);
      const amp = (1 - p) * 0.02;
      return {
        dx: (hash01(step) - 0.5) * 2 * amp,
        dy: (hash01(step + 97) - 0.5) * amp,
        opacity: p >= 1 ? 1 : hash01(step + 31) > 0.25 ? 1 : 0.2,
      };
    },
  }),
  define({
    id: 'drawOn',
    name: 'Draw on',
    category: 'graphic',
    defaultDurationMs: 600,
    defaultEasing: 'easeInOutCubic',
    supportsDirection: false,
    // For shapes the compositor interprets `reveal` as stroke progress.
    pose: (p) => ({ reveal: p, revealUnit: 'none' }),
  }),
];

const PRESET_MAP = new Map(ANIMATION_PRESETS.map((p) => [p.id, p]));

export function getAnimationPreset(id: string): AnimationPreset | undefined {
  return PRESET_MAP.get(id);
}

export function mergePose(base: AnimationPose, delta: Partial<AnimationPose>): AnimationPose {
  return {
    dx: base.dx + (delta.dx ?? 0),
    dy: base.dy + (delta.dy ?? 0),
    scale: base.scale * (delta.scale ?? 1),
    rotation: base.rotation + (delta.rotation ?? 0),
    opacity: base.opacity * (delta.opacity ?? 1),
    blurPx: base.blurPx + (delta.blurPx ?? 0),
    reveal: Math.min(base.reveal, delta.reveal ?? 1),
    revealUnit: delta.revealUnit && delta.revealUnit !== 'none' ? delta.revealUnit : base.revealUnit,
    perUnit: delta.perUnit ?? base.perUnit,
  };
}

/**
 * Evaluate the entrance/exit animations of an item at `localT` ms (relative to item start).
 */
export function evaluateItemAnimation(
  localT: number,
  itemDuration: number,
  animIn: AnimationRef | null | undefined,
  animOut: AnimationRef | null | undefined,
): AnimationPose {
  let pose: AnimationPose = { ...NEUTRAL_POSE };
  const apply = (ref: AnimationRef, progress: number) => {
    const preset = getAnimationPreset(ref.presetId);
    if (!preset) return;
    const p = ease(ref.easing ?? preset.defaultEasing, progress);
    pose = mergePose(pose, preset.pose(p, { direction: ref.direction, params: ref.params }));
  };
  if (animIn) {
    const dur = Math.max(1, animIn.durationMs / animIn.speed);
    apply(animIn, clamp((localT - animIn.delayMs) / dur));
  }
  if (animOut) {
    const dur = Math.max(1, animOut.durationMs / animOut.speed);
    const outStart = itemDuration - dur - animOut.delayMs;
    if (localT > outStart) apply(animOut, 1 - clamp((localT - outStart) / dur));
  }
  return pose;
}

/**
 * Sub-progress for unit i of n when a reveal sweeps across them with overlap.
 * overlap = 0 → strictly sequential; overlap = 1 → all units animate together.
 */
export function unitProgress(reveal: number, index: number, count: number, overlap = 0.5): number {
  if (count <= 1 || reveal >= 1) return clamp(reveal);
  const span = 1 / (count - (count - 1) * overlap);
  const start = index * span * (1 - overlap);
  return clamp((reveal - start) / span);
}
