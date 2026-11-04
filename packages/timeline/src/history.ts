export interface HistoryEntry<T> {
  state: T;
  label: string;
  /** Consecutive commits with the same key are merged (e.g. a drag gesture). */
  coalesceKey?: string;
  at: number;
}

/**
 * Snapshot-based undo/redo. States must be treated as immutable; structural sharing keeps
 * snapshots cheap. Coalescing merges rapid edits (drags, slider scrubs) into one undo step.
 */
export class History<T> {
  private past: HistoryEntry<T>[] = [];
  private future: HistoryEntry<T>[] = [];
  private current: HistoryEntry<T>;

  constructor(
    initial: T,
    private readonly limit = 200,
    private readonly coalesceWindowMs = 800,
  ) {
    this.current = { state: initial, label: 'Initial', at: 0 };
  }

  get state(): T {
    return this.current.state;
  }
  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
  get undoLabel(): string | null {
    return this.canUndo ? this.current.label : null;
  }
  get redoLabel(): string | null {
    return this.future[this.future.length - 1]?.label ?? null;
  }

  commit(state: T, label: string, coalesceKey?: string, now = Date.now()): void {
    if (state === this.current.state) return;
    const merge =
      coalesceKey !== undefined &&
      this.current.coalesceKey === coalesceKey &&
      now - this.current.at < this.coalesceWindowMs;
    if (!merge) {
      this.past.push(this.current);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.current = { state, label, coalesceKey, at: now };
    this.future = [];
  }

  undo(): T {
    const prev = this.past.pop();
    if (prev) {
      this.future.push(this.current);
      this.current = { ...prev, coalesceKey: undefined };
    }
    return this.current.state;
  }

  redo(): T {
    const next = this.future.pop();
    if (next) {
      this.past.push(this.current);
      this.current = { ...next, coalesceKey: undefined };
    }
    return this.current.state;
  }

  /** Replace the present state without creating an undo step (e.g. after loading). */
  reset(state: T): void {
    this.past = [];
    this.future = [];
    this.current = { state, label: 'Initial', at: 0 };
  }
}
