import { spawn } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { parseSilenceDetect, type Span } from '@framecast/export';
import { createLogger } from '../lib/logger.js';

const log = createLogger('ffmpeg');

export interface ProbeResult {
  durationMs: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
}

/** Parse the stream summary ffmpeg prints to stderr for `ffmpeg -i <file>`. */
export function parseProbeOutput(stderr: string): ProbeResult {
  const dur = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const video = /Stream #\d+:\d+[^:]*: Video: .*?(\d{2,5})x(\d{2,5})/.exec(stderr);
  const fps = /(\d+(?:\.\d+)?) fps/.exec(stderr);
  return {
    durationMs: dur ? Math.round((Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3])) * 1000) : null,
    width: video ? Number(video[1]) : null,
    height: video ? Number(video[2]) : null,
    fps: fps ? Number(fps[1]) : null,
    hasVideo: /Stream #\d+:\d+[^:]*: Video:/.test(stderr),
    hasAudio: /Stream #\d+:\d+[^:]*: Audio:/.test(stderr),
  };
}

async function isExecutable(p: string): Promise<boolean> {
  try {
    await access(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Locates ffmpeg: explicit setting → bundled binary (resources/bin) → PATH.
 * Release builds should bundle an LGPL ffmpeg build with VideoToolbox enabled.
 */
export class FfmpegService {
  private resolved: string | null = null;

  constructor(
    private readonly getConfiguredPath: () => string | null,
    private readonly bundledDir: string,
  ) {}

  async path(): Promise<string> {
    const configured = this.getConfiguredPath();
    if (configured && (await isExecutable(configured))) return configured;
    if (this.resolved) return this.resolved;
    const bundled = join(this.bundledDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    if (await isExecutable(bundled)) return (this.resolved = bundled);
    const found = await new Promise<boolean>((resolve) => {
      const p = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
      p.on('error', () => resolve(false));
      p.on('exit', (code) => resolve(code === 0));
    });
    if (found) return (this.resolved = 'ffmpeg');
    throw new Error('ffmpeg was not found. Install ffmpeg or set its path in Settings.');
  }

  async probe(file: string): Promise<ProbeResult> {
    const bin = await this.path();
    return new Promise((resolve, reject) => {
      const p = spawn(bin, ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      p.stderr.on('data', (d: Buffer) => (err += d.toString()));
      p.on('error', reject);
      // ffmpeg exits non-zero without an output file; the stream summary is what we want.
      p.on('exit', () => resolve(parseProbeOutput(err)));
    });
  }

  /**
   * Find silent spans (source ms) in a media file's audio.
   * @param thresholdDb level below which audio counts as silence (e.g. -35)
   */
  async detectSilence(file: string, thresholdDb: number, minSilenceMs: number, durationMs: number): Promise<Span[]> {
    const bin = await this.path();
    const stderr = await new Promise<string>((resolve, reject) => {
      const p = spawn(bin, ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', `silencedetect=n=${thresholdDb}dB:d=${(minSilenceMs / 1000).toFixed(3)}`, '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      p.stderr.on('data', (d: Buffer) => (err += d.toString()));
      p.on('error', reject);
      p.on('exit', (code) => (code === 0 ? resolve(err) : reject(new Error(`Silence detection failed (${code}): ${err.slice(-500)}`))));
    });
    return parseSilenceDetect(stderr, durationMs);
  }

  /** Run ffmpeg to completion, rejecting with stderr on failure. */
  async run(args: string[], signal?: AbortSignal): Promise<void> {
    const bin = await this.path();
    log.debug('run', args);
    await new Promise<void>((resolve, reject) => {
      const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      p.stderr.on('data', (d: Buffer) => (err = (err + d.toString()).slice(-4000)));
      const abort = () => p.kill('SIGKILL');
      signal?.addEventListener('abort', abort, { once: true });
      p.on('error', reject);
      p.on('exit', (code) => {
        signal?.removeEventListener('abort', abort);
        if (code === 0) resolve();
        else reject(new Error(signal?.aborted ? 'Cancelled' : `ffmpeg failed (${code}): ${err.trim()}`));
      });
    });
  }
}
