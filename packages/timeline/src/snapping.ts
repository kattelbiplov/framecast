import type { Timeline } from '@framecast/schema';
import { itemEnd } from './query.js';

export interface SnapResult {
  t: number;
  snapped: boolean;
  target?: number;
}

export function collectSnapPoints(timeline: Timeline, opts: { exclude?: ReadonlySet<string>; playhead?: number } = {}): number[] {
  const pts = new Set<number>([0]);
  for (const track of timeline.tracks) {
    for (const item of track.items) {
      if (opts.exclude?.has(item.id)) continue;
      pts.add(item.start);
      pts.add(itemEnd(item));
    }
  }
  for (const m of timeline.markers) pts.add(m.t);
  if (opts.playhead !== undefined) pts.add(opts.playhead);
  return [...pts].sort((a, b) => a - b);
}

/** Snap t to the nearest point within `thresholdMs`. */
export function snap(t: number, points: readonly number[], thresholdMs: number): SnapResult {
  let best: number | undefined;
  let bestDist = thresholdMs;
  for (const p of points) {
    const d = Math.abs(p - t);
    if (d <= bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best === undefined ? { t, snapped: false } : { t: best, snapped: true, target: best };
}

/** Snap an item being dragged by either of its edges. */
export function snapItemStart(start: number, duration: number, points: readonly number[], thresholdMs: number): SnapResult {
  const a = snap(start, points, thresholdMs);
  const b = snap(start + duration, points, thresholdMs);
  if (a.snapped && (!b.snapped || Math.abs(a.t - start) <= Math.abs(b.t - (start + duration)))) return a;
  if (b.snapped) return { t: b.t - duration, snapped: true, target: b.t };
  return { t: start, snapped: false };
}
