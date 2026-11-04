import { ease } from '@framecast/animation';
import type { CursorStyle, InteractionEvent } from '@framecast/schema';
import { findIdleSpans, idleOpacity, type Span } from './idle.js';
import {
  extractClicks,
  extractRawPath,
  removeJitter,
  samplePath,
  smoothPath,
  type ClickEvent,
  type PathPoint,
} from './path.js';

export interface CursorSample {
  x: number;
  y: number;
  opacity: number;
  /** Press scale: dips while the button is held (cursor "bounce"). */
  scale: number;
  shape: string;
}

export interface ActiveClick {
  click: ClickEvent;
  /** 0..1 progress of the click effect. */
  progress: number;
}

export const CLICK_EFFECT_MS = 450;

/**
 * Pre-processed cursor data for a recording. Construct once per (events, style) pair and
 * sample per frame. Pure and deterministic — preview and export produce identical output.
 */
export class CursorTrack {
  readonly raw: PathPoint[];
  readonly path: PathPoint[];
  readonly clicks: ClickEvent[];
  readonly idle: Span[];
  private readonly shapes: { t: number; shape: string }[];

  constructor(
    events: readonly InteractionEvent[],
    readonly style: Pick<CursorStyle, 'smoothing' | 'hideWhenIdle' | 'idleTimeoutMs' | 'clickScale'>,
  ) {
    this.raw = extractRawPath(events);
    this.clicks = extractClicks(events);
    const dejittered = removeJitter(this.raw, 0.0015 * style.smoothing);
    this.path = smoothPath(dejittered, this.clicks, { smoothing: style.smoothing });
    this.idle = findIdleSpans(this.raw, Math.min(style.idleTimeoutMs, 1000));
    this.shapes = events
      .filter((e): e is Extract<InteractionEvent, { type: 'cursorShape' }> => e.type === 'cursorShape')
      .map((e) => ({ t: e.t, shape: e.shape }));
  }

  get isEmpty(): boolean {
    return this.raw.length === 0;
  }

  sample(t: number): CursorSample {
    const { x, y } = samplePath(this.path, t);
    const opacity = this.style.hideWhenIdle ? idleOpacity(this.idle, t, this.style.idleTimeoutMs) : 1;
    return { x, y, opacity, scale: this.pressScale(t), shape: this.shapeAt(t) };
  }

  /** Clicks whose visual effect is active at time t. */
  activeClicks(t: number, effectMs = CLICK_EFFECT_MS): ActiveClick[] {
    const out: ActiveClick[] = [];
    for (const click of this.clicks) {
      if (click.t > t) break;
      const p = (t - click.t) / effectMs;
      if (p <= 1) out.push({ click, progress: p });
    }
    return out;
  }

  /** Recent positions for motion trails, oldest first. */
  trail(t: number, lengthMs: number, samples = 12): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];
    for (let i = samples; i >= 0; i--) pts.push(samplePath(this.path, t - (lengthMs * i) / samples));
    return pts;
  }

  private pressScale(t: number): number {
    const min = this.style.clickScale;
    for (const c of this.clicks) {
      if (c.t > t + 80) break;
      const release = c.releaseT ?? c.t + 100;
      if (t < c.t - 80 || t > release + 220) continue;
      if (t <= c.t) return 1 - (1 - min) * ease('easeOut', (t - (c.t - 80)) / 80);
      if (t <= release) return min;
      return min + (1 - min) * ease('easeOutBack', (t - release) / 220);
    }
    return 1;
  }

  private shapeAt(t: number): string {
    let shape = 'arrow';
    for (const s of this.shapes) {
      if (s.t > t) break;
      shape = s.shape;
    }
    return shape;
  }
}
