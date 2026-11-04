import type { Asset } from '@framecast/schema';

type Element = HTMLVideoElement | HTMLAudioElement | HTMLImageElement;

/**
 * Owns one hidden media element per asset. Elements are created lazily and reused; the pool is
 * the only place that touches media elements, keeping the compositor pure.
 */
export class MediaPool {
  private els = new Map<string, Element>();
  private listeners = new Set<() => void>();

  constructor(private urls: Record<string, string>, private assets: ReadonlyMap<string, Asset>) {}

  update(urls: Record<string, string>, assets: ReadonlyMap<string, Asset>): void {
    this.urls = urls;
    this.assets = assets;
  }

  /** Called whenever a frame becomes available (seek completed, image loaded). */
  onFrameReady(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get(assetId: string): Element | null {
    const existing = this.els.get(assetId);
    if (existing) return existing;
    const asset = this.assets.get(assetId);
    const url = this.urls[assetId];
    if (!asset || !url) return null;
    let el: Element;
    const notify = () => this.listeners.forEach((l) => l());
    if (asset.mimeType.startsWith('image/')) {
      el = new Image();
      el.decoding = 'async';
      el.onload = notify;
    } else if (asset.mimeType.startsWith('audio/')) {
      el = new Audio();
      el.preload = 'auto';
    } else {
      const v = document.createElement('video');
      v.muted = !asset.hasAudio;
      v.playsInline = true;
      v.preload = 'auto';
      v.addEventListener('seeked', notify);
      v.addEventListener('loadeddata', notify);
      el = v;
    }
    el.crossOrigin = 'anonymous';
    el.src = url;
    this.els.set(assetId, el);
    return el;
  }

  /** Drawable frame for an asset, or null if not decoded yet. */
  frame(assetId: string): CanvasImageSource | null {
    const el = this.get(assetId);
    if (!el) return null;
    if (el instanceof HTMLImageElement) return el.complete && el.naturalWidth > 0 ? el : null;
    if (el instanceof HTMLVideoElement) return el.readyState >= 2 ? el : null;
    return null;
  }

  all(): IterableIterator<[string, Element]> {
    return this.els.entries();
  }

  dispose(): void {
    for (const el of this.els.values()) {
      if (!(el instanceof HTMLImageElement)) {
        el.pause();
        el.removeAttribute('src');
        el.load();
      }
    }
    this.els.clear();
    this.listeners.clear();
  }
}

/** Seek a media element precisely and resolve once the frame is decoded. */
export function seekExact(el: HTMLMediaElement, seconds: number, toleranceSec = 0.004): Promise<void> {
  const target = Math.max(0, Math.min(seconds, Number.isFinite(el.duration) ? el.duration - 0.001 : seconds));
  if (Math.abs(el.currentTime - target) <= toleranceSec && el.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error(`Failed to decode media at ${target.toFixed(3)}s`));
    };
    const cleanup = () => {
      el.removeEventListener('seeked', done);
      el.removeEventListener('error', fail);
    };
    el.addEventListener('seeked', done, { once: true });
    el.addEventListener('error', fail, { once: true });
    el.currentTime = target;
  });
}

export async function whenReady(el: HTMLMediaElement | HTMLImageElement): Promise<void> {
  if (el instanceof HTMLImageElement) {
    if (el.complete && el.naturalWidth) return;
    await el.decode();
    return;
  }
  if (el.readyState >= 1) return;
  await new Promise<void>((resolve, reject) => {
    el.addEventListener('loadedmetadata', () => resolve(), { once: true });
    el.addEventListener('error', () => reject(new Error(`Could not load ${el.currentSrc || el.src}`)), { once: true });
  });
}
