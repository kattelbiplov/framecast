import type { Easing } from '@framecast/schema';
import { ease } from './easing.js';
import { hash01 } from './math.js';

export interface LayerEffect {
  opacity: number;
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
  blurPx: number;
  /** Visible fraction for wipe/mask reveals, swept along `wipeAngleDeg`. */
  wipe: number;
  wipeAngleDeg: number;
}

export const IDENTITY_EFFECT: Readonly<LayerEffect> = Object.freeze({
  opacity: 1,
  dx: 0,
  dy: 0,
  scale: 1,
  rotation: 0,
  blurPx: 0,
  wipe: 1,
  wipeAngleDeg: 0,
});

export interface TransitionPreset {
  id: string;
  name: string;
  defaultDurationMs: number;
  defaultEasing: Easing;
  /** p ∈ [0,1]: 0 = only outgoing visible, 1 = only incoming visible. */
  apply(p: number): { outgoing: Partial<LayerEffect>; incoming: Partial<LayerEffect> };
}

const t = (p: TransitionPreset) => p;

export const TRANSITION_PRESETS: readonly TransitionPreset[] = [
  t({ id: 'fade', name: 'Fade through black', defaultDurationMs: 600, defaultEasing: 'easeInOut',
    apply: (p) => ({ outgoing: { opacity: Math.max(0, 1 - p * 2) }, incoming: { opacity: Math.max(0, p * 2 - 1) } }) }),
  t({ id: 'dissolve', name: 'Dissolve', defaultDurationMs: 500, defaultEasing: 'linear',
    apply: (p) => ({ outgoing: {}, incoming: { opacity: p } }) }),
  t({ id: 'slide', name: 'Slide', defaultDurationMs: 500, defaultEasing: 'easeInOutCubic',
    apply: (p) => ({ outgoing: {}, incoming: { dx: 1 - p } }) }),
  t({ id: 'push', name: 'Push', defaultDurationMs: 500, defaultEasing: 'easeInOutCubic',
    apply: (p) => ({ outgoing: { dx: -p }, incoming: { dx: 1 - p } }) }),
  t({ id: 'zoom', name: 'Zoom', defaultDurationMs: 600, defaultEasing: 'easeInOutCubic',
    apply: (p) => ({ outgoing: { scale: 1 + p * 0.6, opacity: 1 - p }, incoming: { scale: 0.7 + 0.3 * p, opacity: p } }) }),
  t({ id: 'blur', name: 'Blur', defaultDurationMs: 600, defaultEasing: 'easeInOut',
    apply: (p) => ({ outgoing: { blurPx: p * 30, opacity: 1 - p }, incoming: { blurPx: (1 - p) * 30, opacity: p } }) }),
  t({ id: 'wipe', name: 'Wipe', defaultDurationMs: 600, defaultEasing: 'easeInOut',
    apply: (p) => ({ outgoing: {}, incoming: { wipe: p, wipeAngleDeg: 0 } }) }),
  t({ id: 'maskReveal', name: 'Mask reveal', defaultDurationMs: 700, defaultEasing: 'easeInOutCubic',
    apply: (p) => ({ outgoing: { scale: 1 + 0.05 * p }, incoming: { wipe: p, wipeAngleDeg: 45 } }) }),
  t({ id: 'spin', name: 'Spin', defaultDurationMs: 700, defaultEasing: 'easeInOutCubic',
    apply: (p) => ({ outgoing: { rotation: p * 180, scale: 1 - p, opacity: 1 - p }, incoming: { rotation: (p - 1) * 180, scale: p, opacity: p } }) }),
  t({ id: 'whipPan', name: 'Whip pan', defaultDurationMs: 400, defaultEasing: 'easeInOutCubic',
    apply: (p) => ({ outgoing: { dx: -p * 1.2, blurPx: Math.sin(p * Math.PI) * 40 }, incoming: { dx: (1 - p) * 1.2, blurPx: Math.sin(p * Math.PI) * 40 } }) }),
  t({ id: 'motionBlur', name: 'Motion blur', defaultDurationMs: 500, defaultEasing: 'easeInOut',
    apply: (p) => ({ outgoing: { blurPx: p * 40, dy: -p * 0.2, opacity: 1 - p }, incoming: { blurPx: (1 - p) * 40, dy: (1 - p) * 0.2, opacity: p } }) }),
  t({ id: 'glitch', name: 'Glitch', defaultDurationMs: 400, defaultEasing: 'linear',
    apply: (p) => {
      const step = Math.floor(p * 20);
      const jitter = (hash01(step) - 0.5) * 0.06 * Math.sin(p * Math.PI);
      const showIncoming = p > 0.5 ? hash01(step + 7) > 0.15 : hash01(step + 7) > 0.85;
      return { outgoing: { dx: jitter }, incoming: { dx: -jitter, opacity: showIncoming ? 1 : 0 } };
    } }),
];

const MAP = new Map(TRANSITION_PRESETS.map((p) => [p.id, p]));
export const getTransitionPreset = (id: string) => MAP.get(id);

export function evaluateTransition(
  presetId: string,
  progress: number,
  easing?: Easing,
): { outgoing: LayerEffect; incoming: LayerEffect } {
  const preset = MAP.get(presetId) ?? MAP.get('dissolve')!;
  const r = preset.apply(ease(easing ?? preset.defaultEasing, progress));
  return { outgoing: { ...IDENTITY_EFFECT, ...r.outgoing }, incoming: { ...IDENTITY_EFFECT, ...r.incoming } };
}
