export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface ScratchSurface {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: Ctx2D;
}

/**
 * Supplies decoded frames. In preview this returns <video> elements that are playing/seeked;
 * the exporter returns frames decoded for the exact source time. The renderer never decodes.
 */
export interface FrameSources {
  frame(assetId: string, sourceTimeMs: number): CanvasImageSource | null;
}

export interface RenderTarget {
  ctx: Ctx2D;
  /** Output size in device pixels. */
  width: number;
  height: number;
  createScratch(width: number, height: number): ScratchSurface;
}

export function intrinsicSize(img: CanvasImageSource): { width: number; height: number } {
  if (typeof HTMLVideoElement !== 'undefined' && img instanceof HTMLVideoElement) {
    return { width: img.videoWidth, height: img.videoHeight };
  }
  if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) {
    return { width: img.naturalWidth, height: img.naturalHeight };
  }
  if (typeof VideoFrame !== 'undefined' && img instanceof VideoFrame) {
    return { width: img.displayWidth, height: img.displayHeight };
  }
  const anyImg = img as { width: number | SVGAnimatedLength; height: number | SVGAnimatedLength };
  const w = typeof anyImg.width === 'number' ? anyImg.width : anyImg.width.baseVal.value;
  const h = typeof anyImg.height === 'number' ? anyImg.height : anyImg.height.baseVal.value;
  return { width: w, height: h };
}

export function roundRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export const fontString = (weight: number, sizePx: number, family: string): string =>
  `${weight} ${sizePx}px "${family}", Inter, system-ui, -apple-system, sans-serif`;
