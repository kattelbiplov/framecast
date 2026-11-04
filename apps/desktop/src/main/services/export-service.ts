import { aspectSize } from '@framecast/compositor';
import { JobQueue, buildAudioGraph, buildEncodeArgs, containerFor, parseProgress, type Job } from '@framecast/export';
import { newId } from '@framecast/schema';
import { toSrt, toVtt } from '@framecast/subtitles';
import type { BrowserWindow } from 'electron';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { rm, writeFile } from 'node:fs/promises';
import type { ExportJobRequest, ExportJobView, ExportRenderJob } from '../../shared/ipc.js';
import { createLogger } from '../lib/logger.js';
import type { FfmpegService } from './ffmpeg.js';
import type { ProjectStore } from './projects.js';

const log = createLogger('export');

interface Payload extends ExportJobRequest {
  projectName: string;
}

interface RunningRender {
  job: ExportRenderJob;
  ffmpeg: ChildProcessByStdio<Writable, null, Readable>;
  window: BrowserWindow | null;
  totalFrames: number;
  framesWritten: number;
  progress: (f: number) => void;
  framesDone: Promise<void>;
  resolveFrames: () => void;
  rejectFrames: (e: Error) => void;
}

/**
 * Background export pipeline:
 *   hidden renderer (same compositor as preview) → raw RGBA frames over IPC → ffmpeg stdin
 * Each frame IPC resolves only after ffmpeg accepted the bytes, giving natural backpressure.
 */
export class ExportService {
  private readonly queue: JobQueue<Payload>;
  private readonly renders = new Map<string, RunningRender>();

  constructor(
    private readonly deps: {
      store: ProjectStore;
      ffmpeg: FfmpegService;
      createRenderWindow: (jobId: string) => BrowserWindow;
      broadcast: (jobs: ExportJobView[]) => void;
    },
  ) {
    this.queue = new JobQueue<Payload>((p, ctx) => this.run(p, ctx), (jobs) => deps.broadcast(jobs.map(toView)));
  }

  list(): ExportJobView[] {
    return this.queue.list().map(toView);
  }

  async enqueue(req: ExportJobRequest): Promise<string> {
    const opened = await this.deps.store.open(req.projectId);
    const id = newId('exp');
    this.queue.enqueue(id, { ...req, projectName: opened.project.name });
    return id;
  }

  cancel(id: string): void {
    this.queue.cancel(id);
  }

  /* ------------------------------------------------ called by the export renderer */

  renderJob(jobId: string): ExportRenderJob {
    const r = this.renders.get(jobId);
    if (!r) throw new Error('Unknown export job');
    return r.job;
  }

  async writeFrame(jobId: string, frame: Uint8Array): Promise<void> {
    const r = this.renders.get(jobId);
    if (!r) throw new Error('Export cancelled');
    const expected = r.job.size.width * r.job.size.height * 4;
    if (frame.byteLength !== expected) throw new Error(`Frame size mismatch (${frame.byteLength} ≠ ${expected})`);
    await new Promise<void>((resolve, reject) => {
      const ok = r.ffmpeg.stdin.write(frame, (err) => (err ? reject(err) : undefined));
      if (ok) resolve();
      else r.ffmpeg.stdin.once('drain', resolve);
    });
    r.framesWritten += 1;
    r.progress((r.framesWritten / r.totalFrames) * 0.98);
  }

  framesDone(jobId: string): void {
    this.renders.get(jobId)?.resolveFrames();
  }

  frameError(jobId: string, message: string): void {
    this.renders.get(jobId)?.rejectFrames(new Error(message));
  }

  /* ------------------------------------------------ pipeline */

  private async run(p: Payload, ctx: { signal: AbortSignal; progress(f: number): void }): Promise<string> {
    const opened = await this.deps.store.open(p.projectId);
    const { project, dir } = opened;
    const settings = p.settings;
    const size = aspectSize(project.canvas.aspect, settings.height, project.canvas.size);
    const fps = settings.fps;
    const range = p.range;
    const durationMs = Math.max(1, range.end - range.start);

    if (settings.exportSubtitleFile !== 'none') {
      const cues = project.subtitles.flatMap((s) => s.cues).filter((c) => c.end > range.start && c.start < range.end);
      const shifted = cues.map((c) => ({ ...c, start: Math.max(0, c.start - range.start), end: c.end - range.start }));
      const text = settings.exportSubtitleFile === 'srt' ? toSrt(shifted) : toVtt(shifted);
      await writeFile(p.outputPath.replace(/\.[^.]+$/, `.${settings.exportSubtitleFile}`), text, 'utf8');
    }

    const audioOnly = settings.format === 'audio';
    const audio = settings.audioCodec === 'none' || settings.format === 'gif'
      ? null
      : buildAudioGraph(project, (a) => this.deps.store.resolveAssetPath(a, dir), {
          firstInputIndex: audioOnly ? 0 : 1, totalDurationMs: range.end, rangeStartMs: range.start,
        });
    if (audioOnly && !audio) throw new Error('This project has no audio to export');

    const args = buildEncodeArgs(settings, { size, fps, outputPath: p.outputPath, platform: process.platform, audio });
    log.info(`Export ${p.outputPath} ${size.width}x${size.height}@${fps}`, { container: containerFor(settings) });
    const bin = await this.deps.ffmpeg.path();
    const ff = spawn(bin, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    ff.stderr.on('data', (d: Buffer) => {
      const chunk = d.toString();
      stderr = (stderr + chunk).slice(-4000);
      const ms = parseProgress(chunk);
      if (audioOnly && ms !== null) ctx.progress(ms / durationMs);
    });
    const exited = new Promise<number>((resolve, reject) => {
      ff.on('error', reject);
      ff.on('exit', (code) => resolve(code ?? -1));
    });

    const abort = () => ff.kill('SIGKILL');
    ctx.signal.addEventListener('abort', abort, { once: true });

    try {
      if (!audioOnly) {
        const jobId = newId('render');
        let resolveFrames!: () => void;
        let rejectFrames!: (e: Error) => void;
        const framesDone = new Promise<void>((res, rej) => {
          resolveFrames = res;
          rejectFrames = rej;
        });
        const render: RunningRender = {
          job: { id: jobId, opened, settings, range, size, fps },
          ffmpeg: ff,
          window: null,
          totalFrames: Math.ceil((durationMs / 1000) * fps),
          framesWritten: 0,
          progress: ctx.progress,
          framesDone,
          resolveFrames,
          rejectFrames,
        };
        this.renders.set(jobId, render);
        ctx.signal.addEventListener('abort', () => rejectFrames(new Error('Cancelled')), { once: true });
        exited.then((code) => code !== 0 && rejectFrames(new Error(`ffmpeg exited early (${code}): ${stderr.trim()}`)));
        render.window = this.deps.createRenderWindow(jobId);
        try {
          await framesDone;
        } finally {
          this.renders.delete(jobId);
          if (render.window && !render.window.isDestroyed()) render.window.destroy();
        }
      }
      ff.stdin.end();
      const code = await exited;
      if (ctx.signal.aborted) throw new Error('Cancelled');
      if (code !== 0) throw new Error(`Encoding failed: ${stderr.trim() || `exit code ${code}`}`);
      ctx.progress(1);
      return p.outputPath;
    } catch (e) {
      ff.kill('SIGKILL');
      await rm(p.outputPath, { force: true }); // never leave a truncated file behind
      throw e;
    } finally {
      ctx.signal.removeEventListener('abort', abort);
    }
  }
}

function toView(j: Job<Payload>): ExportJobView {
  return { id: j.id, projectName: j.payload.projectName, outputPath: j.payload.outputPath, status: j.status, progress: j.progress, error: j.error };
}
