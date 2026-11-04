import type { AnimatableProperty, Keyframe, KeyframeTracks } from '@framecast/schema';
import { ease } from './easing.js';
import { lerp } from './math.js';

/**
 * Evaluate a keyframe channel at local time `t`. Keyframes need not be sorted.
 * Holds the first/last value outside the keyed range. Returns `fallback` when empty.
 */
export function evaluateKeyframes(keys: readonly Keyframe[] | undefined, t: number, fallback: number): number {
  if (!keys || keys.length === 0) return fallback;
  const sorted = isSorted(keys) ? keys : [...keys].sort((a, b) => a.t - b.t);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (t <= first.t) return first.value;
  if (t >= last.t) return last.value;
  // Binary search for the segment [lo, hi] containing t.
  let lo = 0;
  let hi = sorted.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  const p = (t - a.t) / (b.t - a.t);
  return lerp(a.value, b.value, ease(b.easing, p));
}

function isSorted(keys: readonly Keyframe[]): boolean {
  for (let i = 1; i < keys.length; i++) if (keys[i]!.t < keys[i - 1]!.t) return false;
  return true;
}

export function evaluateChannels(
  tracks: KeyframeTracks | undefined,
  t: number,
  defaults: Partial<Record<AnimatableProperty, number>>,
): Partial<Record<AnimatableProperty, number>> {
  const out: Partial<Record<AnimatableProperty, number>> = { ...defaults };
  if (!tracks) return out;
  for (const [prop, keys] of Object.entries(tracks) as [AnimatableProperty, Keyframe[]][]) {
    out[prop] = evaluateKeyframes(keys, t, defaults[prop] ?? 0);
  }
  return out;
}

/** Insert or replace a keyframe at time t (within 1ms tolerance), returning a new sorted array. */
export function upsertKeyframe(keys: readonly Keyframe[], key: Keyframe): Keyframe[] {
  const next = keys.filter((k) => Math.abs(k.t - key.t) > 1);
  next.push(key);
  return next.sort((a, b) => a.t - b.t);
}
