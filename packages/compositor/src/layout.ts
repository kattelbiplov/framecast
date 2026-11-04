import type { DeviceMockup, FrameStyle, Rect, Size } from '@framecast/schema';

/** Insets (fractions of the screen rect) reserved for device chrome. */
export function mockupInsets(mockup: DeviceMockup): { top: number; right: number; bottom: number; left: number } {
  switch (mockup) {
    case 'browser':
      return { top: 0.06, right: 0, bottom: 0, left: 0 };
    case 'macbook':
      return { top: 0.035, right: 0.035, bottom: 0.1, left: 0.035 };
    case 'monitor':
      return { top: 0.03, right: 0.03, bottom: 0.16, left: 0.03 };
    case 'phone':
      return { top: 0.05, right: 0.045, bottom: 0.05, left: 0.045 };
    case 'tablet':
      return { top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 };
    default:
      return { top: 0, right: 0, bottom: 0, left: 0 };
  }
}

/** Fit a box of aspect `aspect` inside `area`, centred. */
export function fitRect(area: Rect, aspect: number): Rect {
  const areaAspect = area.width / area.height;
  const width = aspect > areaAspect ? area.width : area.height * aspect;
  const height = aspect > areaAspect ? area.width / aspect : area.height;
  return { x: area.x + (area.width - width) / 2, y: area.y + (area.height - height) / 2, width, height };
}

export interface ScreenLayout {
  /** Outer rect including device chrome. */
  frame: Rect;
  /** Where the screen pixels are drawn. */
  content: Rect;
  /** True when the source is cropped to follow the cursor (vertical reframing). */
  reframed: boolean;
}

/**
 * Compute where the screen recording sits on the canvas. When the canvas is much narrower than
 * the source (e.g. 9:16 from a 16:9 recording) the content fills the padded area and the source
 * is cropped instead of letterboxed (smart reframing).
 */
export function layoutScreen(canvas: Size, sourceAspect: number, frame: FrameStyle, reframe: boolean): ScreenLayout {
  const pad = frame.padding * Math.min(canvas.width, canvas.height);
  const area: Rect = { x: pad, y: pad, width: canvas.width - pad * 2, height: canvas.height - pad * 2 };
  const ins = mockupInsets(frame.mockup);
  const chromeAspect = (1 + ins.left + ins.right) / (1 + ins.top + ins.bottom);
  const canvasAspect = area.width / area.height;
  const reframed = reframe && canvasAspect < sourceAspect * 0.75;
  const contentAspect = reframed ? Math.min(sourceAspect, canvasAspect * 1.0) : sourceAspect;
  let outer = fitRect(area, contentAspect * chromeAspect);
  // User scale/offset.
  const s = frame.scale;
  outer = {
    x: outer.x + (outer.width * (1 - s)) / 2 + frame.offset.x * canvas.width,
    y: outer.y + (outer.height * (1 - s)) / 2 + frame.offset.y * canvas.height,
    width: outer.width * s,
    height: outer.height * s,
  };
  const cw = outer.width / (1 + ins.left + ins.right);
  const ch = outer.height / (1 + ins.top + ins.bottom);
  const content: Rect = { x: outer.x + cw * ins.left, y: outer.y + ch * ins.top, width: cw, height: ch };
  return { frame: outer, content, reframed };
}

export function aspectSize(aspect: string, height: number, custom?: Size): Size {
  const [w, h] = aspect.split(':').map(Number);
  if (!w || !h) return custom ?? { width: Math.round((height * 16) / 9 / 2) * 2, height };
  // Even dimensions are required by most H.264 encoders.
  return { width: Math.round((height * w) / h / 2) * 2, height: Math.round(height / 2) * 2 };
}
