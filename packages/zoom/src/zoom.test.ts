import type { InteractionEvent } from '@framecast/schema';
import { describe, expect, it } from 'vitest';
import { clampCenter, evaluateCamera, generateAutoZooms, getZoomPreset, projectThroughCamera } from './index.js';

const click = (t: number, x: number, y: number): InteractionEvent[] => [
  { type: 'down', t, x, y, button: 'left' },
  { type: 'up', t: t + 60, x, y, button: 'left' },
];

describe('auto zoom', () => {
  it('clusters nearby clicks into one zoom and separates distant ones', () => {
    const events = [...click(2000, 0.2, 0.2), ...click(3000, 0.3, 0.25), ...click(20000, 0.8, 0.8)];
    const zooms = generateAutoZooms(events, getZoomPreset('smooth'), { durationMs: 30000 });
    expect(zooms).toHaveLength(2);
    expect(zooms[0]!.origin).toBe('auto');
    expect(zooms[0]!.start).toBeLessThan(2000);
    expect(zooms[0]!.start + zooms[0]!.duration).toBeGreaterThan(3000);
  });

  it('presentation preset uses fixed focus at the cluster centroid', () => {
    const events = [...click(5000, 0.2, 0.4), ...click(6000, 0.4, 0.6)];
    const [z] = generateAutoZooms(events, getZoomPreset('presentation'), { durationMs: 20000 });
    expect(z!.focus).toEqual({ mode: 'fixed', point: { x: expect.closeTo(0.3), y: expect.closeTo(0.5) } });
  });

  it('clamps to recording bounds', () => {
    const zooms = generateAutoZooms(click(100, 0.5, 0.5), getZoomPreset('cinematic'), { durationMs: 3500 });
    for (const z of zooms) {
      expect(z.start).toBeGreaterThanOrEqual(0);
      expect(z.start + z.duration).toBeLessThanOrEqual(3500);
    }
  });
});

describe('camera', () => {
  const zoom = {
    id: 'z', type: 'zoom' as const, start: 1000, duration: 2000, scale: 2,
    focus: { mode: 'fixed' as const, point: { x: 0.9, y: 0.1 } },
    transitionInMs: 500, transitionOutMs: 500, easing: 'linear' as const, origin: 'manual' as const, disabled: false,
  };
  it('eases in, holds and eases out; keeps viewport inside the frame', () => {
    expect(evaluateCamera([zoom], 0).scale).toBe(1);
    expect(evaluateCamera([zoom], 1250).scale).toBeCloseTo(1.5);
    const held = evaluateCamera([zoom], 2000);
    expect(held.scale).toBe(2);
    expect(held.center).toEqual({ x: 0.75, y: 0.25 });
    expect(evaluateCamera([{ ...zoom, disabled: true }], 2000).scale).toBe(1);
  });
  it('projects points', () => {
    const cam = { scale: 2, center: { x: 0.75, y: 0.25 }, amount: 1 };
    expect(projectThroughCamera({ x: 0.75, y: 0.25 }, cam)).toEqual({ x: 0.5, y: 0.5 });
    expect(clampCenter({ x: 0, y: 1 }, 4)).toEqual({ x: 0.125, y: 0.875 });
  });
});
