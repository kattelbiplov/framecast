import { clamp, ease } from '@framecast/animation';
import type { GraphicItem, GraphicKind, Size } from '@framecast/schema';

/** Base size of each graphic in logical px for a 1080-tall canvas. */
const BASE_SIZE: Record<GraphicKind, { width: number; height: number }> = {
  lowerThird: { width: 760, height: 150 },
  progressBar: { width: 0, height: 14 }, // width = 90% of canvas
  notification: { width: 580, height: 124 },
  barChart: { width: 780, height: 440 },
  subscribe: { width: 380, height: 100 },
  counter: { width: 460, height: 220 },
};

/** Canvas-space size of a graphic (before animation scale). */
export function graphicSize(kind: GraphicKind, canvas: Size, scale = 1): { width: number; height: number } {
  const k = canvas.height / 1080;
  const base = BASE_SIZE[kind];
  const width = kind === 'progressBar' ? canvas.width * 0.9 : base.width * k;
  return { width: width * scale, height: base.height * k * scale };
}

/** Built-in intro progress (0..1) shared by renderers: graphics assemble over ~0.9 s. */
export const graphicIntro = (localT: number, ms = 900) => ease('easeOutCubic', clamp(localT / ms));

/** Value shown by a counter at local time t (counts up over the first 1.6 s). */
export function counterValue(item: Pick<GraphicItem, 'values'>, localT: number): number {
  const target = item.values[0] ?? 100;
  const decimals = Number.isInteger(target) ? 0 : 1;
  const v = target * ease('easeOutCubic', clamp(localT / 1600));
  return Number(v.toFixed(decimals));
}

/** Progress-bar fill: tracks the item's own duration (e.g. a video progress indicator). */
export const progressFill = (localT: number, duration: number) => clamp(localT / Math.max(1, duration));

/** Subscribe button flips to "subscribed" after this fraction of its duration. */
export const SUBSCRIBE_CLICK_AT = 0.45;
