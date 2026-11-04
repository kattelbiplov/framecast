import type { Easing, EasingPresetName } from '@framecast/schema';
import { clamp } from './math.js';

export type EasingFn = (t: number) => number;

/**
 * Cubic-bezier timing function identical to CSS `cubic-bezier()`.
 * Solves x(s) = t with Newton-Raphson, falling back to bisection.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFn {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const sampleDX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;

  const solve = (x: number): number => {
    let s = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(s) - x;
      if (Math.abs(err) < 1e-6) return s;
      const d = sampleDX(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0;
    let hi = 1;
    s = x;
    while (hi - lo > 1e-6) {
      const v = sampleX(s);
      if (v < x) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return s;
  };
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sampleY(solve(t));
  };
}

/**
 * Damped harmonic oscillator step response, normalized so the animation settles at t = 1.
 * Supports under-, critically- and over-damped springs.
 */
export function spring(stiffness: number, damping: number, mass = 1): EasingFn {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const response = (tau: number): number => {
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return (
        1 -
        Math.exp(-zeta * w0 * tau) * (Math.cos(wd * tau) + ((zeta * w0) / wd) * Math.sin(wd * tau))
      );
    }
    if (zeta === 1) return 1 - Math.exp(-w0 * tau) * (1 + w0 * tau);
    const r1 = -w0 * (zeta - Math.sqrt(zeta * zeta - 1));
    const r2 = -w0 * (zeta + Math.sqrt(zeta * zeta - 1));
    return 1 + (r2 * Math.exp(r1 * tau) - r1 * Math.exp(r2 * tau)) / (r1 - r2);
  };
  // Time for the envelope to decay below 0.1%.
  const decay = Math.max(zeta * w0, w0 * (zeta > 1 ? zeta - Math.sqrt(zeta * zeta - 1) : 0), 1e-3);
  const settle = Math.min(Math.log(1000) / decay, 60);
  return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : response(t * settle));
}

const easeOutBounce: EasingFn = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

export const EASING_PRESETS: Record<EasingPresetName, EasingFn> = {
  linear: (t) => t,
  easeIn: cubicBezier(0.42, 0, 1, 1),
  easeOut: cubicBezier(0, 0, 0.58, 1),
  easeInOut: cubicBezier(0.42, 0, 0.58, 1),
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeOutQuint: (t) => 1 - Math.pow(1 - t, 5),
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeOutElastic: (t) =>
    t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  easeOutBounce,
  step: (t) => (t < 1 ? 0 : 1),
};

const cache = new WeakMap<object, EasingFn>();

export function resolveEasing(easing: Easing | undefined): EasingFn {
  if (easing === undefined) return EASING_PRESETS.easeInOut;
  if (typeof easing === 'string') return EASING_PRESETS[easing];
  const hit = cache.get(easing);
  if (hit) return hit;
  const fn =
    easing.type === 'cubicBezier'
      ? cubicBezier(easing.x1, easing.y1, easing.x2, easing.y2)
      : spring(easing.stiffness, easing.damping, easing.mass);
  cache.set(easing, fn);
  return fn;
}

export function ease(easing: Easing | undefined, t: number): number {
  return resolveEasing(easing)(clamp(t));
}
