import { RECORDING_SCHEMA_VERSION, newId, type CaptureSource, type InteractionEvent, type RecordedMediaTrack, type RecordingMetadata } from '@framecast/schema';
import { app, screen } from 'electron';
import { appendFile, mkdir, open, readFile, readdir, rename, rm, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import type { OpenedProject, RecordingOptions, RecordingState, RecoveryEntry, StreamKind } from '../../../shared/ipc.js';
import { atomicWriteJson, exists, readJson } from '../../lib/fs.js';
import { createLogger } from '../../lib/logger.js';
import { getCachedSource } from '../capture/sources.js';
import { PollingCursorTracker } from '../capture/cursor-tracker.js';
import type { NativeCaptureBridge, NativeTrack } from '../capture/native-bridge.js';
import type { FfmpegService } from '../ffmpeg.js';
import type { ProjectStore } from '../projects.js';
import { addRecordingToProject } from './build-project.js';
import { RecordingClock } from './clock.js';

const log = createLogger('recording');

const STREAM_FILE: Record<StreamKind, string> = {
  screen: 'screen', webcam: 'webcam', microphone: 'microphone', systemAudio: 'system-audio',
};

interface SessionFile {
  sessionId: string;
  startedAt: string;
  engine: 'screencapturekit' | 'chromium';
  options: RecordingOptions;
  source: CaptureSource;
  captureSize?: { width: number; height: number };
  status: 'recording' | 'finalizing' | 'finalized';
}

interface ActiveSession {
  file: SessionFile;
  dir: string;
  clock: RecordingClock;
  streams: Map<StreamKind, { handle: FileHandle; mimeType: string; queue: Promise<void>; info: { width?: number; height?: number; label?: string } }>;
  eventBuffer: InteractionEvent[];
  eventFlush: NodeJS.Timeout | null;
  tracker: PollingCursorTracker | null;
  countdownTimer: NodeJS.Timeout | null;
  tickTimer: NodeJS.Timeout | null;
  streamsDone: (() => void) | null;
  nativeResult?: Awaited<ReturnType<NativeCaptureBridge['stop']>>;
}

const IDLE: RecordingState = { phase: 'idle', sessionId: null, engine: null, elapsedMs: 0, countdownRemaining: 0, error: null, projectId: null };

/**
 * Orchestrates a recording session:
 *   idle → countdown → recording ⇄ paused → finalizing → idle(projectId)
 *
 * Media is written to disk incrementally (chunks / native writers) and interaction events are
 * appended to events.jsonl every second, so a crash loses at most ~1 s and the session can be
 * recovered on next launch.
 */
export class RecordingSessionManager {
  private state: RecordingState = IDLE;
  private session: ActiveSession | null = null;

  constructor(
    private readonly deps: {
      sessionsDir: () => string;
      store: ProjectStore;
      ffmpeg: FfmpegService;
      native: NativeCaptureBridge;
      excludedBundleIds: () => string[];
      broadcast: (state: RecordingState) => void;
    },
  ) {
    deps.native.onInteraction((e) => this.session?.eventBuffer.push(e));
    deps.native.onError((message) => this.fail(message));
  }

  getState(): RecordingState {
    return this.state;
  }

  async start(options: RecordingOptions): Promise<RecordingState> {
    if (this.state.phase !== 'idle' && this.state.phase !== 'error') throw new Error('A recording is already in progress');
    const engine = (await this.deps.native.isAvailable()) ? 'screencapturekit' : 'chromium';
    const sessionId = newId('rec');
    const dir = join(this.deps.sessionsDir(), sessionId);
    await mkdir(dir, { recursive: true });
    const sourceInfo = options.sourceId ? getCachedSource(options.sourceId) : undefined;
    const source: CaptureSource = !sourceInfo
      ? { kind: 'none', name: 'No screen' }
      : options.region && sourceInfo.kind === 'display'
        ? { kind: 'region', displayId: sourceInfo.displayId ?? '', name: sourceInfo.name, region: options.region }
        : sourceInfo.kind === 'display'
          ? { kind: 'display', displayId: sourceInfo.displayId ?? '', name: sourceInfo.name }
          : { kind: 'window', windowId: sourceInfo.id, name: sourceInfo.name };
    const display = sourceInfo?.bounds ? sourceInfo.bounds : screen.getPrimaryDisplay().bounds;
    const file: SessionFile = {
      sessionId, startedAt: new Date().toISOString(), engine, options, source, status: 'recording',
      captureSize: sourceInfo?.kind === 'display' ? { width: display.width, height: display.height } : undefined,
    };
    await atomicWriteJson(join(dir, 'session.json'), file);

    this.session = {
      file, dir, clock: new RecordingClock(), streams: new Map(), eventBuffer: [], eventFlush: null,
      tracker: null, countdownTimer: null, tickTimer: null, streamsDone: null,
    };
    this.setState({ ...IDLE, phase: 'countdown', sessionId, engine, countdownRemaining: options.countdownSec });
    if (options.countdownSec <= 0) await this.beginCapture();
    else this.runCountdown(options.countdownSec);
    return this.state;
  }

  private runCountdown(seconds: number): void {
    let remaining = seconds;
    const s = this.session!;
    s.countdownTimer = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) this.setState({ ...this.state, countdownRemaining: remaining });
      else {
        clearInterval(s.countdownTimer!);
        s.countdownTimer = null;
        void this.beginCapture().catch((e) => this.fail(e instanceof Error ? e.message : String(e)));
      }
    }, 1000);
  }

  private async beginCapture(): Promise<void> {
    const s = this.requireSession();
    const { options, engine, source } = s.file;
    if (engine === 'screencapturekit') {
      await this.deps.native.start({
        outputDir: s.dir,
        displayId: source.kind === 'display' || source.kind === 'region' ? source.displayId : undefined,
        windowId: source.kind === 'window' ? source.windowId.split(':')[1] : undefined,
        region: options.region,
        fps: options.fps,
        showCursor: !options.hideCursor,
        captureSystemAudio: options.systemAudio,
        microphoneId: options.microphoneDeviceId,
        excludeBundleIds: [app.isPackaged ? 'com.framecast.app' : 'com.github.Electron', ...this.deps.excludedBundleIds()],
        trackEvents: options.trackInteractions,
        trackShortcuts: options.trackShortcuts,
      });
    } else if (options.trackInteractions && source.kind !== 'window' && source.kind !== 'none') {
      const info = options.sourceId ? getCachedSource(options.sourceId) : undefined;
      const bounds = info?.bounds ?? screen.getPrimaryDisplay().bounds;
      s.tracker = new PollingCursorTracker(bounds, { now: () => s.clock.timeAt(Date.now()) }, (e) => s.eventBuffer.push(e));
      s.tracker.start();
    }
    s.clock.start(Date.now());
    s.eventFlush = setInterval(() => void this.flushEvents(), 1000);
    s.tickTimer = setInterval(() => this.setState({ ...this.state, elapsedMs: s.clock.elapsed(Date.now()) }), 250);
    this.setState({ ...this.state, phase: 'recording', countdownRemaining: 0 });
  }

  async pause(): Promise<RecordingState> {
    const s = this.requireSession();
    if (this.state.phase !== 'recording') return this.state;
    s.clock.pause(Date.now());
    if (s.file.engine === 'screencapturekit') await this.deps.native.pause();
    this.setState({ ...this.state, phase: 'paused', elapsedMs: s.clock.elapsed(Date.now()) });
    return this.state;
  }

  async resume(): Promise<RecordingState> {
    const s = this.requireSession();
    if (this.state.phase !== 'paused') return this.state;
    if (s.file.engine === 'screencapturekit') await this.deps.native.resume();
    s.clock.resume(Date.now());
    this.setState({ ...this.state, phase: 'recording' });
    return this.state;
  }

  async cancel(): Promise<RecordingState> {
    const s = this.session;
    if (!s) return this.state;
    this.stopTimers(s);
    if (s.file.engine === 'screencapturekit') this.deps.native.dispose();
    for (const st of s.streams.values()) await st.handle.close().catch(() => undefined);
    await rm(s.dir, { recursive: true, force: true });
    this.session = null;
    this.setState(IDLE);
    return this.state;
  }

  async stop(): Promise<RecordingState> {
    const s = this.requireSession();
    if (this.state.phase === 'countdown') return this.cancel();
    if (this.state.phase !== 'recording' && this.state.phase !== 'paused') return this.state;
    if (s.clock.isPaused) s.clock.resume(Date.now());
    const durationMs = s.clock.elapsed(Date.now());
    this.stopTimers(s);
    this.setState({ ...this.state, phase: 'finalizing', elapsedMs: durationMs });
    s.file.status = 'finalizing';
    await atomicWriteJson(join(s.dir, 'session.json'), s.file);
    void this.finalize(s, durationMs).catch((e) => this.fail(e instanceof Error ? e.message : String(e)));
    return this.state;
  }

  /* ---------------------------------------------------------- chromium-engine stream sink */

  async writeChunk(sessionId: string, kind: StreamKind, mimeType: string, data: Uint8Array): Promise<void> {
    const s = this.session;
    if (!s || s.file.sessionId !== sessionId) throw new Error('No such recording session');
    let stream = s.streams.get(kind);
    if (!stream) {
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const handle = await open(join(s.dir, `${STREAM_FILE[kind]}.${ext}`), 'a');
      stream = { handle, mimeType, queue: Promise.resolve(), info: {} };
      s.streams.set(kind, stream);
    }
    const st = stream;
    st.queue = st.queue.then(async () => {
      await st.handle.write(data);
    });
    await st.queue;
  }

  setStreamInfo(sessionId: string, kind: StreamKind, info: { width?: number; height?: number; label?: string }): void {
    const st = this.session?.file.sessionId === sessionId ? this.session.streams.get(kind) : undefined;
    if (st) st.info = { ...st.info, ...info };
    else if (this.session?.file.sessionId === sessionId) {
      void atomicWriteJson(join(this.session.dir, `${STREAM_FILE[kind]}.info.json`), info);
    }
  }

  markStreamsDone(sessionId: string): void {
    if (this.session?.file.sessionId === sessionId) this.session.streamsDone?.();
  }

  /* ---------------------------------------------------------- finalize & recovery */

  private async finalize(s: ActiveSession, durationMs: number): Promise<void> {
    let nativeTracks: NativeTrack[] | null = null;
    if (s.file.engine === 'screencapturekit') {
      const result = await this.deps.native.stop();
      nativeTracks = result.tracks;
      s.file.captureSize = result.captureSize;
    }
    // Renderer-side streams (all streams on the Chromium engine; the webcam on the native engine).
    if (s.file.engine === 'chromium' || s.streams.size > 0) {
      await new Promise<void>((resolve) => {
        s.streamsDone = resolve;
        setTimeout(resolve, 10_000); // bounded wait for the final MediaRecorder chunks
      });
      for (const st of s.streams.values()) {
        await st.queue;
        await st.handle.close();
      }
    }
    await this.flushEvents();
    const opened = await this.buildProject(s.dir, s.file, durationMs, s.clock.pauses, nativeTracks, false);
    this.session = null;
    this.setState({ ...IDLE, projectId: opened.project.id });
  }

  private async buildProject(
    dir: string, file: SessionFile, durationMs: number, pauses: { atMs: number; wallDurationMs: number }[],
    nativeTracks: NativeTrack[] | null, recovered: boolean,
  ): Promise<OpenedProject> {
    const tracks: RecordedMediaTrack[] = [
      ...(nativeTracks ?? []).map((t): RecordedMediaTrack => ({
        id: newId('trk'), kind: t.kind, file: t.file, mimeType: t.mimeType, durationMs: t.durationMs, startOffsetMs: t.startOffsetMs,
        size: t.width && t.height ? { width: t.width, height: t.height } : undefined, fps: t.fps, sampleRate: t.sampleRate,
      })),
      ...(await this.collectChromiumTracks(dir, durationMs)),
    ];
    const events = await readEvents(join(dir, 'events.jsonl'));
    const screenTrack = tracks.find((t) => t.kind === 'screen');
    const meta: RecordingMetadata = {
      schemaVersion: RECORDING_SCHEMA_VERSION,
      id: file.sessionId,
      createdAt: file.startedAt,
      appVersion: app.getVersion(),
      engine: file.engine,
      source: file.source,
      captureSize: screenTrack?.size ?? file.captureSize,
      durationMs: Math.max(durationMs, ...tracks.map((t) => t.durationMs)),
      tracks,
      // getDisplayMedia always bakes the cursor in; ScreenCaptureKit lets us omit it.
      cursorBakedIn: file.engine === 'chromium' || !file.options.hideCursor,
      events,
      pauses,
      recovered,
    };
    await atomicWriteJson(join(dir, 'metadata.json'), meta);
    file.status = 'finalized';
    await atomicWriteJson(join(dir, 'session.json'), file);

    const name = file.options.projectName?.trim() || `Recording ${new Date(file.startedAt).toLocaleString()}`;
    return this.deps.store.create(name, async (project, projectDir) => {
      const rel = `recordings/${meta.id}`;
      await mkdir(join(projectDir, 'recordings'), { recursive: true });
      await rename(dir, join(projectDir, rel)); // same volume: sessions live inside the library
      return addRecordingToProject(project, meta, rel);
    });
  }

  /** Remux MediaRecorder output (adds duration + cues so files are seekable) and probe it. */
  private async collectChromiumTracks(dir: string, fallbackDuration: number): Promise<RecordedMediaTrack[]> {
    const tracks: RecordedMediaTrack[] = [];
    for (const kind of Object.keys(STREAM_FILE) as StreamKind[]) {
      for (const ext of ['webm', 'mp4']) {
        const raw = join(dir, `${STREAM_FILE[kind]}.${ext}`);
        if (!(await exists(raw))) continue;
        const fileName = `${STREAM_FILE[kind]}.${ext}`;
        const fixed = join(dir, `${STREAM_FILE[kind]}.fixed.${ext}`);
        try {
          await this.deps.ffmpeg.run(['-hide_banner', '-y', '-i', raw, '-c', 'copy', fixed]);
          await rename(fixed, raw);
        } catch (e) {
          log.warn(`Remux of ${fileName} failed; keeping original`, e);
          await rm(fixed, { force: true });
        }
        const probe = await this.deps.ffmpeg.probe(raw).catch(() => null);
        tracks.push({
          id: newId('trk'), kind, file: fileName, mimeType: ext === 'mp4' ? 'video/mp4' : kind === 'microphone' || kind === 'systemAudio' ? 'audio/webm' : 'video/webm',
          durationMs: probe?.durationMs ?? fallbackDuration, startOffsetMs: 0,
          size: probe?.width && probe.height ? { width: probe.width, height: probe.height } : undefined,
          fps: probe?.fps ?? undefined,
        });
      }
    }
    return tracks;
  }

  async listRecoveries(): Promise<RecoveryEntry[]> {
    const root = this.deps.sessionsDir();
    if (!(await exists(root))) return [];
    const out: RecoveryEntry[] = [];
    for (const id of await readdir(root)) {
      if (this.session?.file.sessionId === id) continue;
      try {
        const file = await readJson<SessionFile>(join(root, id, 'session.json'));
        if (file.status !== 'finalized') out.push({ sessionId: id, dir: join(root, id), startedAt: file.startedAt });
      } catch {
        /* not a session dir */
      }
    }
    return out;
  }

  /** Salvage an interrupted session into a project. Returns the new project id. */
  async recover(sessionId: string): Promise<string | null> {
    const dir = join(this.deps.sessionsDir(), sessionId);
    const file = await readJson<SessionFile>(join(dir, 'session.json'));
    const events = await readEvents(join(dir, 'events.jsonl'));
    const lastEvent = events.at(-1)?.t ?? 0;
    // Native recordings are written with fragmented MOV so partial files remain readable.
    const nativeTracks = file.engine === 'screencapturekit' ? await this.probeNativeLeftovers(dir) : null;
    const opened = await this.buildProject(dir, file, lastEvent, [], nativeTracks, true);
    return opened.project.id;
  }

  async discardRecovery(sessionId: string): Promise<void> {
    const dir = join(this.deps.sessionsDir(), sessionId);
    if (await exists(join(dir, 'session.json'))) await rm(dir, { recursive: true, force: true });
  }

  private async probeNativeLeftovers(dir: string): Promise<NativeTrack[]> {
    const files: [NativeTrack['kind'], string, string][] = [
      ['screen', 'screen.mov', 'video/quicktime'], ['systemAudio', 'system-audio.m4a', 'audio/mp4'], ['microphone', 'microphone.m4a', 'audio/mp4'],
    ];
    const out: NativeTrack[] = [];
    for (const [kind, name, mimeType] of files) {
      if (!(await exists(join(dir, name)))) continue;
      const p = await this.deps.ffmpeg.probe(join(dir, name)).catch(() => null);
      out.push({ kind, file: name, mimeType, durationMs: p?.durationMs ?? 0, startOffsetMs: 0, width: p?.width ?? undefined, height: p?.height ?? undefined });
    }
    return out;
  }

  /* ---------------------------------------------------------- internals */

  private async flushEvents(): Promise<void> {
    const s = this.session;
    if (!s || s.eventBuffer.length === 0) return;
    const batch = s.eventBuffer.splice(0);
    await appendFile(join(s.dir, 'events.jsonl'), batch.map((e) => JSON.stringify(e)).join('\n') + '\n');
  }

  private stopTimers(s: ActiveSession): void {
    s.tracker?.stop();
    for (const t of [s.countdownTimer, s.tickTimer, s.eventFlush]) if (t) clearInterval(t);
    s.countdownTimer = s.tickTimer = s.eventFlush = null;
  }

  private fail(message: string): void {
    log.error('Recording failed', message);
    if (this.session) this.stopTimers(this.session);
    this.setState({ ...this.state, phase: 'error', error: message });
  }

  private requireSession(): ActiveSession {
    if (!this.session) throw new Error('No active recording');
    return this.session;
  }

  private setState(next: RecordingState): void {
    this.state = next;
    this.deps.broadcast(next);
  }
}

async function readEvents(file: string): Promise<InteractionEvent[]> {
  if (!(await exists(file))) return [];
  const lines = (await readFile(file, 'utf8')).split('\n');
  const events: InteractionEvent[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as InteractionEvent);
    } catch {
      /* torn final line after a crash */
    }
  }
  return events.sort((a, b) => a.t - b.t);
}
