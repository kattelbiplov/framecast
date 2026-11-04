import { composeFrame, renderScene, type Composition, type FrameScene, type RenderTarget } from '@framecast/compositor';
import type { MediaPool } from './media-pool';

const DRIFT_TOLERANCE_S = 0.15;

/**
 * Real-time preview: drives a clock while playing, keeps media elements in sync with the scene
 * the compositor produces, and paints each frame with the shared renderer.
 */
export class PreviewPlayer {
  private raf = 0;
  private playing = false;
  private clockOrigin = 0;
  private timeOrigin = 0;
  private time = 0;
  private dirty = true;
  private offFrame: () => void;

  constructor(
    private target: RenderTarget,
    private comp: Composition,
    private readonly pool: MediaPool,
    private readonly callbacks: { onTime(t: number): void; onEnded(): void; getDuration(): number },
  ) {
    this.offFrame = pool.onFrameReady(() => (this.dirty = true));
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  setComposition(comp: Composition): void {
    this.comp = comp;
    this.dirty = true;
  }

  setTarget(target: RenderTarget): void {
    this.target = target;
    this.dirty = true;
  }

  seek(t: number): void {
    if (Math.abs(t - this.time) < 0.5 && !this.playing) return;
    this.time = t;
    if (this.playing) {
      this.clockOrigin = performance.now();
      this.timeOrigin = t;
    }
    this.dirty = true;
  }

  play(): void {
    if (this.playing) return;
    if (this.time >= this.callbacks.getDuration() - 10) this.time = 0;
    this.playing = true;
    this.clockOrigin = performance.now();
    this.timeOrigin = this.time;
  }

  pause(): void {
    this.playing = false;
    for (const [, el] of this.pool.all()) if (!(el instanceof HTMLImageElement)) el.pause();
    this.dirty = true;
  }

  /** Render the current frame into an arbitrary target (thumbnails). */
  snapshot(target: RenderTarget, t: number): void {
    renderScene(target, composeFrame(this.comp, t), { frame: (id) => this.pool.frame(id) });
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.offFrame();
    this.pause();
  }

  private loop(now: number): void {
    this.raf = requestAnimationFrame(this.loop);
    if (this.playing) {
      this.time = this.timeOrigin + (now - this.clockOrigin);
      const duration = this.callbacks.getDuration();
      if (this.time >= duration) {
        this.time = duration;
        this.pause();
        this.callbacks.onEnded();
      }
      this.callbacks.onTime(this.time);
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    const scene = composeFrame(this.comp, this.time);
    this.syncMedia(scene);
    renderScene(this.target, scene, { frame: (id) => this.pool.frame(id) });
  }

  private syncMedia(scene: FrameScene): void {
    const wanted = new Map<string, { time: number; rate: number; gain: number | null }>();
    const want = (assetId: string, timeMs: number, rate = 1, gain: number | null = null) => {
      const prev = wanted.get(assetId);
      wanted.set(assetId, { time: timeMs / 1000, rate, gain: gain ?? prev?.gain ?? null });
    };
    for (const l of scene.screen?.layers ?? []) want(l.assetId, l.sourceTime);
    if (scene.webcam) want(scene.webcam.assetId, scene.webcam.sourceTime);
    for (const o of scene.overlays) if (o.kind === 'video') want(o.assetId, o.sourceTime);
    if (scene.background.type === 'video') want(scene.background.assetId, scene.t);
    for (const v of scene.audio) want(v.assetId, v.sourceTime, v.rate, v.gain);

    for (const [assetId, w] of wanted) {
      const el = this.pool.get(assetId);
      if (!el || el instanceof HTMLImageElement) continue;
      el.volume = Math.max(0, Math.min(1, w.gain ?? 0));
      el.muted = w.gain === null || w.gain <= 0;
      if (this.playing) {
        if (el.playbackRate !== w.rate) el.playbackRate = w.rate;
        if (Math.abs(el.currentTime - w.time) > DRIFT_TOLERANCE_S) el.currentTime = w.time;
        if (el.paused) void el.play().catch(() => undefined);
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - w.time) > 1 / 120) el.currentTime = w.time;
      }
    }
    for (const [assetId, el] of this.pool.all()) {
      if (!wanted.has(assetId) && !(el instanceof HTMLImageElement) && !el.paused) el.pause();
    }
  }
}

export function canvasTarget(canvas: HTMLCanvasElement): RenderTarget {
  const ctx = canvas.getContext('2d', { alpha: true })!;
  return {
    ctx,
    width: canvas.width,
    height: canvas.height,
    createScratch: (w, h) => {
      const c = new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
      return { canvas: c, ctx: c.getContext('2d')! };
    },
  };
}
