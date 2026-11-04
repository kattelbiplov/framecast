export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface Job<P> {
  id: string;
  payload: P;
  status: JobStatus;
  progress: number;
  error?: string;
  result?: string;
}

export interface JobContext {
  signal: AbortSignal;
  progress(fraction: number): void;
}

export type JobRunner<P> = (payload: P, ctx: JobContext) => Promise<string>;

/**
 * Sequential background job queue (exports are CPU/GPU heavy; running them one at a time keeps
 * the editor responsive and memory bounded). Emits a snapshot on every change.
 */
export class JobQueue<P> {
  private jobs: Job<P>[] = [];
  private controllers = new Map<string, AbortController>();
  private running = false;

  constructor(
    private readonly runner: JobRunner<P>,
    private readonly onChange: (jobs: readonly Job<P>[]) => void = () => {},
  ) {}

  list(): readonly Job<P>[] {
    return this.jobs;
  }

  enqueue(id: string, payload: P): Job<P> {
    const job: Job<P> = { id, payload, status: 'queued', progress: 0 };
    this.jobs = [...this.jobs, job];
    this.emit();
    void this.pump();
    return job;
  }

  cancel(id: string): void {
    const job = this.jobs.find((j) => j.id === id);
    if (!job) return;
    if (job.status === 'queued') this.patch(id, { status: 'cancelled' });
    this.controllers.get(id)?.abort();
  }

  clearFinished(): void {
    this.jobs = this.jobs.filter((j) => j.status === 'queued' || j.status === 'running');
    this.emit();
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let job = this.next(); job; job = this.next()) {
        const ctrl = new AbortController();
        this.controllers.set(job.id, ctrl);
        this.patch(job.id, { status: 'running' });
        const id = job.id;
        try {
          const result = await this.runner(job.payload, {
            signal: ctrl.signal,
            progress: (f) => this.patch(id, { progress: Math.max(0, Math.min(1, f)) }),
          });
          this.patch(id, ctrl.signal.aborted ? { status: 'cancelled' } : { status: 'done', progress: 1, result });
        } catch (err) {
          this.patch(id, ctrl.signal.aborted ? { status: 'cancelled' } : { status: 'failed', error: err instanceof Error ? err.message : String(err) });
        } finally {
          this.controllers.delete(id);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private next(): Job<P> | undefined {
    return this.jobs.find((j) => j.status === 'queued');
  }

  private patch(id: string, patch: Partial<Job<P>>): void {
    this.jobs = this.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
    this.emit();
  }

  private emit(): void {
    this.onChange(this.jobs);
  }
}
