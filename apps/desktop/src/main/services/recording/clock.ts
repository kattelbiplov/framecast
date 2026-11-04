/** Monotonic recording clock that excludes paused time. Times are injected for testability. */
export class RecordingClock {
  private startedAt: number | null = null;
  private pausedAt: number | null = null;
  private pausedTotal = 0;
  readonly pauses: { atMs: number; wallDurationMs: number }[] = [];

  start(now: number): void {
    this.startedAt = now;
    this.pausedAt = null;
    this.pausedTotal = 0;
    this.pauses.length = 0;
  }

  pause(now: number): void {
    if (this.startedAt === null || this.pausedAt !== null) return;
    this.pausedAt = now;
  }

  resume(now: number): void {
    if (this.pausedAt === null) return;
    const d = now - this.pausedAt;
    this.pauses.push({ atMs: this.elapsedAt(this.pausedAt), wallDurationMs: d });
    this.pausedTotal += d;
    this.pausedAt = null;
  }

  get isPaused(): boolean {
    return this.pausedAt !== null;
  }

  /** Recording time at wall time `now`, or null if not started / currently paused. */
  timeAt(now: number): number | null {
    if (this.startedAt === null || this.pausedAt !== null) return null;
    return this.elapsedAt(now);
  }

  elapsed(now: number): number {
    if (this.startedAt === null) return 0;
    return this.elapsedAt(this.pausedAt ?? now);
  }

  private elapsedAt(now: number): number {
    return Math.max(0, now - (this.startedAt ?? now) - this.pausedTotal);
  }
}
