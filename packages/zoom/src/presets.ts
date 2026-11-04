import type { Easing } from '@framecast/schema';

export interface ZoomPreset {
  id: string;
  name: string;
  description: string;
  scale: number;
  transitionInMs: number;
  transitionOutMs: number;
  easing: Easing;
  /** How long the zoom lingers after the last interaction in a cluster. */
  holdMs: number;
  /** Interactions closer than this are merged into one zoom. */
  clusterMs: number;
  /** Zoom starts this long before the first interaction (anticipation). */
  leadMs: number;
  /** Ignore clusters shorter than this once padded (avoids flicker). */
  minDurationMs: number;
  followCursor: boolean;
  triggers: { clicks: boolean; pauses: boolean; shortcuts: boolean; scroll: boolean };
  /** Cursor pause length that counts as a "point of interest". */
  pauseMs: number;
}

export const ZOOM_PRESETS: readonly ZoomPreset[] = [
  {
    id: 'subtle',
    name: 'Subtle',
    description: 'Gentle 1.4× pushes that keep context visible.',
    scale: 1.4, transitionInMs: 900, transitionOutMs: 900, easing: 'easeInOutCubic',
    holdMs: 1600, clusterMs: 2500, leadMs: 500, minDurationMs: 1800, followCursor: true,
    triggers: { clicks: true, pauses: false, shortcuts: false, scroll: false }, pauseMs: 1500,
  },
  {
    id: 'smooth',
    name: 'Smooth',
    description: 'Balanced default: 2× zoom that follows the cursor.',
    scale: 2, transitionInMs: 750, transitionOutMs: 800, easing: 'easeInOutCubic',
    holdMs: 1400, clusterMs: 2200, leadMs: 400, minDurationMs: 1500, followCursor: true,
    triggers: { clicks: true, pauses: false, shortcuts: true, scroll: false }, pauseMs: 1500,
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Slow, long-held zooms with soft easing.',
    scale: 1.8, transitionInMs: 1400, transitionOutMs: 1500, easing: { type: 'cubicBezier', x1: 0.65, y1: 0, x2: 0.35, y2: 1 },
    holdMs: 2400, clusterMs: 3500, leadMs: 800, minDurationMs: 3000, followCursor: true,
    triggers: { clicks: true, pauses: true, shortcuts: false, scroll: false }, pauseMs: 2000,
  },
  {
    id: 'fast',
    name: 'Fast',
    description: 'Snappy zooms for quick-paced demos.',
    scale: 2.2, transitionInMs: 350, transitionOutMs: 400, easing: 'easeOutQuint',
    holdMs: 900, clusterMs: 1200, leadMs: 200, minDurationMs: 900, followCursor: true,
    triggers: { clicks: true, pauses: false, shortcuts: true, scroll: false }, pauseMs: 1000,
  },
  {
    id: 'presentation',
    name: 'Presentation',
    description: 'Fixed-focus zooms that do not chase the cursor.',
    scale: 1.6, transitionInMs: 1000, transitionOutMs: 1000, easing: 'easeInOut',
    holdMs: 2500, clusterMs: 4000, leadMs: 600, minDurationMs: 2500, followCursor: false,
    triggers: { clicks: true, pauses: true, shortcuts: false, scroll: false }, pauseMs: 2500,
  },
  {
    id: 'tutorial',
    name: 'Tutorial',
    description: 'Zooms on every click and cursor pause to guide viewers.',
    scale: 2.4, transitionInMs: 700, transitionOutMs: 700, easing: 'easeInOutCubic',
    holdMs: 1800, clusterMs: 1800, leadMs: 400, minDurationMs: 1500, followCursor: true,
    triggers: { clicks: true, pauses: true, shortcuts: true, scroll: false }, pauseMs: 1200,
  },
  {
    id: 'productDemo',
    name: 'Product demo',
    description: 'Confident 2× zooms with spring easing.',
    scale: 2, transitionInMs: 800, transitionOutMs: 900, easing: { type: 'spring', stiffness: 120, damping: 20, mass: 1 },
    holdMs: 1500, clusterMs: 2600, leadMs: 450, minDurationMs: 1800, followCursor: true,
    triggers: { clicks: true, pauses: false, shortcuts: true, scroll: true }, pauseMs: 1500,
  },
];

const MAP = new Map(ZOOM_PRESETS.map((p) => [p.id, p]));
export function getZoomPreset(id: string): ZoomPreset {
  return MAP.get(id) ?? MAP.get('smooth')!;
}
