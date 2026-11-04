import { describe, expect, it } from 'vitest';
import {
  ANIMATION_PRESETS,
  cubicBezier,
  evaluateItemAnimation,
  evaluateKeyframes,
  evaluateTransition,
  spring,
  unitProgress,
} from './index.js';

describe('easing', () => {
  it('cubic bezier matches endpoints and is monotonic for ease', () => {
    const f = cubicBezier(0.25, 0.1, 0.25, 1);
    expect(f(0)).toBe(0);
    expect(f(1)).toBe(1);
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const v = f(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
    expect(f(0.5)).toBeCloseTo(0.8024, 3); // CSS `ease` reference value
  });

  it('springs settle at 1 and underdamped springs overshoot', () => {
    const bouncy = spring(200, 10);
    const values = Array.from({ length: 101 }, (_, i) => bouncy(i / 100));
    expect(Math.max(...values)).toBeGreaterThan(1);
    expect(bouncy(1)).toBe(1);
    const critical = spring(100, 20);
    expect(Math.max(...Array.from({ length: 101 }, (_, i) => critical(i / 100)))).toBeLessThanOrEqual(1);
  });
});

describe('keyframes', () => {
  const keys = [
    { id: 'a', t: 0, value: 0, easing: 'linear' as const },
    { id: 'b', t: 1000, value: 10, easing: 'linear' as const },
    { id: 'c', t: 2000, value: 0, easing: 'linear' as const },
  ];
  it('interpolates and holds outside the range', () => {
    expect(evaluateKeyframes(keys, -5, 99)).toBe(0);
    expect(evaluateKeyframes(keys, 500, 99)).toBe(5);
    expect(evaluateKeyframes(keys, 1500, 99)).toBe(5);
    expect(evaluateKeyframes(keys, 5000, 99)).toBe(0);
    expect(evaluateKeyframes([], 5, 42)).toBe(42);
  });
  it('handles unsorted input', () => {
    expect(evaluateKeyframes([keys[2]!, keys[0]!, keys[1]!], 500, 0)).toBe(5);
  });
});

describe('presets', () => {
  it('every preset is neutral at p = 1', () => {
    for (const preset of ANIMATION_PRESETS) {
      const pose = preset.pose(1, { direction: 'up', params: {} });
      expect(pose.opacity ?? 1, preset.id).toBeCloseTo(1);
      expect(pose.dx ?? 0, preset.id).toBeCloseTo(0);
      expect(pose.scale ?? 1, preset.id).toBeCloseTo(1);
    }
  });

  it('applies entrance and exit around the hold', () => {
    const ref = { presetId: 'fade', durationMs: 200, delayMs: 0, speed: 1, direction: 'none' as const, params: {}, easing: 'linear' as const };
    expect(evaluateItemAnimation(0, 1000, ref, ref).opacity).toBe(0);
    expect(evaluateItemAnimation(100, 1000, ref, ref).opacity).toBeCloseTo(0.5);
    expect(evaluateItemAnimation(500, 1000, ref, ref).opacity).toBe(1);
    expect(evaluateItemAnimation(900, 1000, ref, ref).opacity).toBeCloseTo(0.5);
  });

  it('staggers units', () => {
    expect(unitProgress(0, 0, 4)).toBe(0);
    expect(unitProgress(1, 3, 4)).toBe(1);
    expect(unitProgress(0.3, 0, 4)).toBeGreaterThan(unitProgress(0.3, 3, 4));
  });

  it('transitions start on outgoing and end on incoming', () => {
    const a = evaluateTransition('dissolve', 0, 'linear');
    const b = evaluateTransition('dissolve', 1, 'linear');
    expect(a.incoming.opacity).toBe(0);
    expect(b.incoming.opacity).toBe(1);
  });
});
