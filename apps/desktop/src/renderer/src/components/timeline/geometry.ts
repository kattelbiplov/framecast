export const LABEL_WIDTH = 168;
export const ROW_HEIGHT = 40;
export const RULER_HEIGHT = 26;

export const msToPx = (ms: number, pps: number) => (ms / 1000) * pps;
export const pxToMs = (px: number, pps: number) => (px / pps) * 1000;

const STEPS = [100, 250, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000];

/** Pick a ruler step so labels are at least `minPx` apart. */
export function rulerStep(pps: number, minPx = 80): number {
  return STEPS.find((s) => msToPx(s, pps) >= minPx) ?? STEPS[STEPS.length - 1]!;
}
