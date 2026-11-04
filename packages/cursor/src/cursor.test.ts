import type { InteractionEvent } from '@framecast/schema';
import { describe, expect, it } from 'vitest';
import { CursorTrack, extractClicks, findIdleSpans, idleOpacity, removeJitter } from './index.js';

const moves = (pts: [number, number, number][]): InteractionEvent[] =>
  pts.map(([t, x, y]) => ({ type: 'move', t, x, y }));

describe('cursor engine', () => {
  it('pairs mouse down/up and flags double clicks', () => {
    const clicks = extractClicks([
      { type: 'down', t: 100, x: 0.5, y: 0.5, button: 'left' },
      { type: 'up', t: 150, x: 0.5, y: 0.5, button: 'left' },
      { type: 'down', t: 300, x: 0.5, y: 0.5, button: 'left' },
      { type: 'up', t: 350, x: 0.5, y: 0.5, button: 'left' },
    ]);
    expect(clicks).toHaveLength(2);
    expect(clicks[0]!.releaseT).toBe(150);
    expect(clicks.every((c) => c.double)).toBe(true);
  });

  it('removes sub-threshold jitter but keeps endpoints', () => {
    const path = [0, 1, 2, 3, 4].map((i) => ({ t: i * 10, x: 0.5 + (i % 2) * 0.0001, y: 0.5 }));
    expect(removeJitter(path, 0.001)).toHaveLength(2);
  });

  it('smoothed cursor lands exactly on click points', () => {
    const events: InteractionEvent[] = [
      ...moves([
        [0, 0.1, 0.1],
        [100, 0.9, 0.9],
        [200, 0.2, 0.8],
        [500, 0.6, 0.4],
      ]),
      { type: 'down', t: 500, x: 0.6, y: 0.4, button: 'left' },
      { type: 'up', t: 560, x: 0.6, y: 0.4, button: 'left' },
      ...moves([[1000, 0.6, 0.4]]),
    ];
    const track = new CursorTrack(events, { smoothing: 0.8, hideWhenIdle: false, idleTimeoutMs: 2000, clickScale: 0.8 });
    const s = track.sample(500);
    expect(s.x).toBeCloseTo(0.6, 3);
    expect(s.y).toBeCloseTo(0.4, 3);
    expect(s.scale).toBeCloseTo(0.8);
    // Smoothing must not track the sharp zig-zag at t=100 exactly.
    expect(track.sample(100).x).toBeLessThan(0.85);
    expect(track.activeClicks(600)).toHaveLength(1);
  });

  it('detects idle spans and fades the cursor', () => {
    const path = [
      { t: 0, x: 0.5, y: 0.5 },
      { t: 5000, x: 0.5, y: 0.5 },
      { t: 5100, x: 0.9, y: 0.9 },
    ];
    const spans = findIdleSpans(path, 1000);
    expect(spans[0]).toEqual({ start: 0, end: 5100 });
    expect(idleOpacity(spans, 1000, 2000)).toBe(1);
    expect(idleOpacity(spans, 3000, 2000)).toBe(0);
    expect(idleOpacity(spans, 5600, 2000)).toBe(1);
  });
});
