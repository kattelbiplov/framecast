import type { PathPoint } from './path.js';

export interface Span {
  start: number;
  end: number;
}

/**
 * Find spans where the cursor stayed within `radius` for at least `minMs`.
 * Used both to hide idle cursors and as zoom triggers (cursor pauses).
 */
export function findIdleSpans(path: readonly PathPoint[], minMs: number, radius = 0.004): Span[] {
  const spans: Span[] = [];
  if (path.length === 0) return spans;
  let anchor = path[0]!;
  for (let i = 1; i <= path.length; i++) {
    const p = path[i];
    const moved = p ? Math.hypot(p.x - anchor.x, p.y - anchor.y) > radius : true;
    if (moved) {
      const endT = p ? p.t : Number.POSITIVE_INFINITY;
      if (endT - anchor.t >= minMs) spans.push({ start: anchor.t, end: endT });
      if (p) anchor = p;
    }
  }
  return spans;
}

/** Opacity of the cursor at time t given idle spans, fading out/in over `fadeMs`. */
export function idleOpacity(spans: readonly Span[], t: number, idleTimeoutMs: number, fadeMs = 250): number {
  for (const s of spans) {
    const hideAt = s.start + idleTimeoutMs;
    if (s.end <= hideAt || t < hideAt || t > s.end + fadeMs) continue;
    const hiddenAt = (time: number) => Math.min(1, (time - hideAt) / fadeMs);
    if (t <= s.end) return 1 - hiddenAt(t);
    const level = 1 - hiddenAt(s.end);
    return level + (1 - level) * Math.min(1, (t - s.end) / fadeMs);
  }
  return 1;
}
