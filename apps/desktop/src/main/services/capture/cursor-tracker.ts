import { screen } from 'electron';
import type { InteractionEvent } from '@framecast/schema';

export interface TrackerClock {
  /** Recording-clock time (ms, pauses excluded) or null while paused. */
  now(): number | null;
}

/**
 * Fallback interaction tracker for the Chromium engine: polls the global cursor position.
 * It cannot observe clicks or keys (that needs the native helper's CGEventTap), so auto-zoom
 * falls back to cursor-pause triggers on this engine.
 */
export class PollingCursorTracker {
  private timer: NodeJS.Timeout | null = null;
  private last: { x: number; y: number } | null = null;

  constructor(
    private readonly bounds: { x: number; y: number; width: number; height: number },
    private readonly clock: TrackerClock,
    private readonly emit: (e: InteractionEvent) => void,
    private readonly hz = 60,
  ) {}

  start(): void {
    this.stop();
    this.timer = setInterval(() => this.tick(), 1000 / this.hz);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const t = this.clock.now();
    if (t === null) return;
    const p = screen.getCursorScreenPoint();
    const x = (p.x - this.bounds.x) / this.bounds.width;
    const y = (p.y - this.bounds.y) / this.bounds.height;
    if (this.last && Math.abs(this.last.x - x) < 1e-4 && Math.abs(this.last.y - y) < 1e-4) return;
    this.last = { x, y };
    this.emit({ type: 'move', t: Math.round(t), x: round4(x), y: round4(y) });
  }
}

const round4 = (v: number) => Math.round(v * 10000) / 10000;
