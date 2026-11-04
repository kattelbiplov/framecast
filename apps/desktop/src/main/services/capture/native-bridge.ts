import { InteractionEvent } from '@framecast/schema';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('native-capture');

export interface NativeStartParams {
  outputDir: string;
  displayId?: string;
  windowId?: string;
  region?: { x: number; y: number; width: number; height: number } | null;
  fps: number;
  showCursor: boolean;
  captureSystemAudio: boolean;
  microphoneId: string | null;
  excludeBundleIds: string[];
  trackEvents: boolean;
  trackShortcuts: boolean;
}

export interface NativeTrack {
  kind: 'screen' | 'systemAudio' | 'microphone';
  file: string;
  mimeType: string;
  durationMs: number;
  startOffsetMs: number;
  width?: number;
  height?: number;
  fps?: number;
  sampleRate?: number;
}

export interface NativeStopResult {
  durationMs: number;
  captureSize: { width: number; height: number };
  tracks: NativeTrack[];
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

/**
 * JSON-lines RPC client for the Swift `framecast-capture` helper (ScreenCaptureKit +
 * AVAssetWriter/VideoToolbox + CGEventTap). See native/macos/FramecastCapture.
 *
 *   → {"id":1,"method":"start","params":{...}}
 *   ← {"id":1,"result":{...}}            responses
 *   ← {"event":"interaction","data":{…}} unsolicited events
 */
export class NativeCaptureBridge {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private eventListener: ((e: InteractionEvent) => void) | null = null;
  private errorListener: ((message: string) => void) | null = null;

  constructor(private readonly binDir: string) {}

  get binaryPath(): string {
    return join(this.binDir, 'framecast-capture');
  }

  async isAvailable(): Promise<boolean> {
    if (process.platform !== 'darwin') return false;
    try {
      await access(this.binaryPath, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  onInteraction(listener: (e: InteractionEvent) => void): void {
    this.eventListener = listener;
  }

  onError(listener: (message: string) => void): void {
    this.errorListener = listener;
  }

  start(params: NativeStartParams): Promise<void> {
    return this.call('start', params) as Promise<void>;
  }
  pause(): Promise<void> {
    return this.call('pause') as Promise<void>;
  }
  resume(): Promise<void> {
    return this.call('resume') as Promise<void>;
  }
  async stop(): Promise<NativeStopResult> {
    const result = (await this.call('stop')) as NativeStopResult;
    this.dispose();
    return result;
  }

  dispose(): void {
    this.proc?.stdin.end();
    this.proc?.kill();
    this.proc = null;
    for (const p of this.pending.values()) p.reject(new Error('Capture helper exited'));
    this.pending.clear();
  }

  private ensureProcess(): ChildProcessWithoutNullStreams {
    if (this.proc) return this.proc;
    const proc = spawn(this.binaryPath, ['--rpc'], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc = proc;
    createInterface({ input: proc.stdout }).on('line', (line) => this.onLine(line));
    proc.stderr.on('data', (d: Buffer) => log.warn(d.toString().trim()));
    proc.on('exit', (code) => {
      if (this.proc === proc) {
        this.proc = null;
        if (code !== 0) this.errorListener?.(`Capture helper exited unexpectedly (code ${code})`);
        for (const p of this.pending.values()) p.reject(new Error(`Capture helper exited (${code})`));
        this.pending.clear();
      }
    });
    return proc;
  }

  private call(method: string, params?: unknown): Promise<unknown> {
    const proc = this.ensureProcess();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      proc.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  private onLine(line: string): void {
    let msg: { id?: number; result?: unknown; error?: string; event?: string; data?: unknown };
    try {
      msg = JSON.parse(line);
    } catch {
      log.warn('Unparseable helper output', line);
      return;
    }
    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) p?.reject(new Error(msg.error));
      else p?.resolve(msg.result);
      return;
    }
    if (msg.event === 'interaction') {
      const parsed = InteractionEvent.safeParse(msg.data);
      if (parsed.success) this.eventListener?.(parsed.data);
    } else if (msg.event === 'error') {
      this.errorListener?.(String((msg.data as { message?: string })?.message ?? 'Capture error'));
    }
  }
}
