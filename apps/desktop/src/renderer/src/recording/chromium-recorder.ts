import type { RecordingOptions, RecordingState, StreamKind } from '../../../shared/ipc';
import { invoke, subscribe } from '../lib/ipc';

interface Recorder {
  kind: StreamKind;
  recorder: MediaRecorder;
  /** Serializes chunk uploads so they hit disk in order. */
  chain: Promise<void>;
}

/** Device acquisition can hang (e.g. a disconnected microphone); never let it freeze the UI. */
function withTimeout<T>(p: Promise<T>, what: string, ms = 15_000): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timed out waiting for ${what}. Check the device and permissions.`)), ms)),
  ]);
}

function pickMime(candidates: string[]): string {
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

const VIDEO_MIMES = ['video/webm;codecs=vp9', 'video/webm;codecs=h264', 'video/webm;codecs=vp8', 'video/webm'];
const AUDIO_MIMES = ['audio/webm;codecs=opus', 'audio/webm'];

/**
 * Renderer half of recording. With the Chromium engine it captures screen, system audio,
 * microphone and webcam into *separate* MediaRecorder streams (so each stays independently
 * editable). With the native engine only the webcam is captured here.
 *
 * Streams are acquired *before* the countdown so permission prompts never eat recording time.
 */
export class RecordingController {
  private streams = new Map<StreamKind, MediaStream>();
  private recorders: Recorder[] = [];
  private sessionId: string | null = null;
  private offState: (() => void) | null = null;
  private lastPhase: RecordingState['phase'] = 'idle';

  async begin(opts: RecordingOptions, nativeEngine: boolean): Promise<void> {
    await this.acquire(opts, nativeEngine);
    this.offState = subscribe('recording:state', (s) => void this.onState(s));
    try {
      const state = await invoke('recording:start', opts);
      this.sessionId = state.sessionId;
      await this.onState(state);
    } catch (e) {
      this.release();
      throw e;
    }
  }

  private async acquire(opts: RecordingOptions, nativeEngine: boolean): Promise<void> {
    try {
      if (!nativeEngine && opts.sourceId) {
        // Tell main which source should answer this getDisplayMedia() request.
        await invoke('capture:prepareDisplay', opts.sourceId, opts.systemAudio);
        const display = await withTimeout(navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: opts.fps, max: opts.fps } },
          audio: opts.systemAudio,
        }), 'screen capture');
        const [video] = display.getVideoTracks();
        if (video) {
          video.contentHint = 'detail'; // favour sharp text over motion smoothness
          this.streams.set('screen', new MediaStream([video]));
        }
        const sys = display.getAudioTracks();
        if (sys.length) this.streams.set('systemAudio', new MediaStream(sys));
      }
      if (!nativeEngine && opts.microphoneDeviceId !== null) {
        const mic = await withTimeout(navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: opts.microphoneDeviceId ? { exact: opts.microphoneDeviceId } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        }), 'the microphone');
        this.streams.set('microphone', mic);
      }
      if (opts.webcamDeviceId !== null) {
        const cam = await withTimeout(navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: opts.webcamDeviceId ? { exact: opts.webcamDeviceId } : undefined,
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
        }), 'the camera');
        this.streams.set('webcam', cam);
      }
    } catch (e) {
      this.release();
      throw e;
    }
  }

  private async onState(state: RecordingState): Promise<void> {
    // With no countdown, main broadcasts 'recording' before recording:start resolves, so the
    // session id must be adopted from the event itself.
    if (this.sessionId === null && state.sessionId) this.sessionId = state.sessionId;
    if (state.sessionId && state.sessionId !== this.sessionId) return;
    const prev = this.lastPhase;
    this.lastPhase = state.phase;
    if (state.phase === prev) return;
    if (state.phase === 'recording' && prev !== 'paused') this.startRecorders();
    else if (state.phase === 'recording' && prev === 'paused') this.recorders.forEach((r) => r.recorder.state === 'paused' && r.recorder.resume());
    else if (state.phase === 'paused') this.recorders.forEach((r) => r.recorder.state === 'recording' && r.recorder.pause());
    else if (state.phase === 'finalizing') await this.finish();
    else if (state.phase === 'idle' || state.phase === 'error') this.release();
  }

  private startRecorders(): void {
    const id = this.sessionId!;
    for (const [kind, stream] of this.streams) {
      const isVideo = kind === 'screen' || kind === 'webcam';
      const mimeType = pickMime(isVideo ? VIDEO_MIMES : AUDIO_MIMES);
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: kind === 'screen' ? 16_000_000 : kind === 'webcam' ? 4_000_000 : undefined,
        audioBitsPerSecond: isVideo ? undefined : 160_000,
      });
      const rec: Recorder = { kind, recorder, chain: Promise.resolve() };
      recorder.ondataavailable = (e) => {
        if (e.data.size === 0) return;
        rec.chain = rec.chain
          .then(async () => invoke('recording:chunk', id, kind, recorder.mimeType, new Uint8Array(await e.data.arrayBuffer())))
          .catch((err) => console.error('chunk upload failed', err));
      };
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings();
      void invoke('recording:streamInfo', id, kind, { width: settings?.width, height: settings?.height, label: track?.label ?? stream.getAudioTracks()[0]?.label });
      recorder.start(1000); // 1 s chunks: bounded memory, ≤1 s lost on crash
      this.recorders.push(rec);
    }
  }

  private async finish(): Promise<void> {
    const id = this.sessionId;
    await Promise.all(
      this.recorders.map(
        (r) =>
          new Promise<void>((resolve) => {
            if (r.recorder.state === 'inactive') return resolve();
            r.recorder.addEventListener('stop', () => resolve(), { once: true });
            r.recorder.stop();
          }),
      ),
    );
    await Promise.all(this.recorders.map((r) => r.chain));
    if (id) await invoke('recording:streamsDone', id);
    this.release();
  }

  private release(): void {
    for (const s of this.streams.values()) s.getTracks().forEach((t) => t.stop());
    this.streams.clear();
    this.recorders = [];
    this.offState?.();
    this.offState = null;
    this.sessionId = null;
    this.lastPhase = 'idle';
  }
}

export const recordingController = new RecordingController();
