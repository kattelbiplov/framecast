import { clamp, lerp } from '@framecast/animation';
import type { InteractionEvent } from '@framecast/schema';

export interface PathPoint {
  t: number;
  x: number;
  y: number;
}

export interface ClickEvent {
  t: number;
  x: number;
  y: number;
  button: 'left' | 'right' | 'middle';
  /** Time of the matching mouse-up, if any. */
  releaseT: number | null;
  /** True when a second click follows quickly at the same spot. */
  double: boolean;
}

/** Every event carrying a position contributes to the raw cursor path. */
export function extractRawPath(events: readonly InteractionEvent[]): PathPoint[] {
  const out: PathPoint[] = [];
  for (const e of events) {
    if (e.type === 'move' || e.type === 'down' || e.type === 'up' || e.type === 'scroll') {
      out.push({ t: e.t, x: e.x, y: e.y });
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

export function extractClicks(events: readonly InteractionEvent[], doubleClickMs = 400): ClickEvent[] {
  const clicks: ClickEvent[] = [];
  for (const e of events) {
    if (e.type === 'down') {
      clicks.push({ t: e.t, x: e.x, y: e.y, button: e.button, releaseT: null, double: false });
    } else if (e.type === 'up') {
      for (let i = clicks.length - 1; i >= 0; i--) {
        const c = clicks[i]!;
        if (c.button === e.button && c.releaseT === null) {
          c.releaseT = e.t;
          break;
        }
      }
    }
  }
  for (let i = 1; i < clicks.length; i++) {
    const a = clicks[i - 1]!;
    const b = clicks[i]!;
    if (b.t - a.t < doubleClickMs && Math.hypot(b.x - a.x, b.y - a.y) < 0.01) {
      a.double = true;
      b.double = true;
    }
  }
  return clicks;
}

/**
 * Drop sub-threshold jitter: points are only accepted once the cursor moves more than
 * `deadZone` (normalized units) from the last accepted point.
 */
export function removeJitter(path: readonly PathPoint[], deadZone: number): PathPoint[] {
  if (path.length === 0 || deadZone <= 0) return [...path];
  const out: PathPoint[] = [path[0]!];
  for (let i = 1; i < path.length; i++) {
    const p = path[i]!;
    const last = out[out.length - 1]!;
    if (Math.hypot(p.x - last.x, p.y - last.y) >= deadZone || i === path.length - 1) out.push(p);
  }
  return out;
}

/** Linear interpolation of a time-sorted path. */
export function samplePath(path: readonly PathPoint[], t: number): { x: number; y: number } {
  if (path.length === 0) return { x: 0.5, y: 0.5 };
  const first = path[0]!;
  const last = path[path.length - 1]!;
  if (t <= first.t) return { x: first.x, y: first.y };
  if (t >= last.t) return { x: last.x, y: last.y };
  let lo = 0;
  let hi = path.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = path[lo]!;
  const b = path[hi]!;
  const p = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
  return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) };
}

export interface SmoothOptions {
  /** 0 = raw, 1 = heavy smoothing. */
  smoothing: number;
  /** Window around each click (ms) in which the smoothed cursor is pulled onto the click point. */
  clickSnapMs?: number;
  stepMs?: number;
}

/**
 * Smooth a cursor path with a critically damped spring following the raw path. Near clicks the
 * result is blended back to the raw position so clicks land exactly where they happened.
 */
export function smoothPath(
  raw: readonly PathPoint[],
  clicks: readonly ClickEvent[],
  { smoothing, clickSnapMs = 120, stepMs = 1000 / 120 }: SmoothOptions,
): PathPoint[] {
  if (raw.length < 2 || smoothing <= 0) return [...raw];
  // Map smoothing 0..1 to spring angular frequency (rad/s): higher = snappier.
  const omega = lerp(40, 5, clamp(smoothing));
  const start = raw[0]!.t;
  const end = raw[raw.length - 1]!.t;
  const out: PathPoint[] = [];
  let { x, y } = raw[0]!;
  let vx = 0;
  let vy = 0;
  let clickIdx = 0;
  const dt = stepMs / 1000;
  for (let t = start; t <= end + stepMs; t += stepMs) {
    const target = samplePath(raw, t);
    // Critically damped spring integration (semi-implicit Euler).
    const ax = omega * omega * (target.x - x) - 2 * omega * vx;
    const ay = omega * omega * (target.y - y) - 2 * omega * vy;
    vx += ax * dt;
    vy += ay * dt;
    x += vx * dt;
    y += vy * dt;

    while (clickIdx < clicks.length && clicks[clickIdx]!.t < t - clickSnapMs) clickIdx++;
    let snap = 0;
    for (let i = clickIdx; i < clicks.length && clicks[i]!.t <= t + clickSnapMs; i++) {
      const c = clicks[i]!;
      const hold = c.releaseT ?? c.t;
      const d = t < c.t ? c.t - t : t > hold ? t - hold : 0;
      snap = Math.max(snap, 1 - d / clickSnapMs);
    }
    const px = lerp(x, target.x, snap);
    const py = lerp(y, target.y, snap);
    if (snap > 0) {
      // Keep the simulation state consistent with the snapped output.
      x = px;
      y = py;
      vx *= 1 - snap;
      vy *= 1 - snap;
    }
    out.push({ t: Math.min(t, end), x: px, y: py });
  }
  return out;
}
