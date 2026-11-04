import { clamp, ease, lerp } from '@framecast/animation';
import type { Vec2, ZoomItem } from '@framecast/schema';

export interface CameraState {
  /** Magnification of the screen recording (1 = no zoom). */
  scale: number;
  /** Normalized point of the screen recording at the centre of the viewport. */
  center: Vec2;
  /** 0..1 how far into the active zoom we are (used e.g. to shrink the webcam). */
  amount: number;
}

export const IDENTITY_CAMERA: Readonly<CameraState> = Object.freeze({ scale: 1, center: { x: 0.5, y: 0.5 }, amount: 0 });

/** Keep the viewport within the frame for a given scale. */
export function clampCenter(center: Vec2, scale: number): Vec2 {
  const half = 0.5 / Math.max(1, scale);
  return { x: clamp(center.x, half, 1 - half), y: clamp(center.y, half, 1 - half) };
}

/**
 * Evaluate the virtual camera at timeline time t.
 * @param focusAt returns the (smoothed) cursor position at timeline time t, if available.
 */
export function evaluateCamera(
  zooms: readonly ZoomItem[],
  t: number,
  focusAt?: (t: number) => Vec2 | null,
): CameraState {
  const active = zooms.find((z) => !z.disabled && t >= z.start && t <= z.start + z.duration);
  if (!active) return IDENTITY_CAMERA;
  const local = t - active.start;
  const inMs = Math.min(active.transitionInMs, active.duration / 2);
  const outMs = Math.min(active.transitionOutMs, active.duration / 2);
  let amount = 1;
  if (inMs > 0 && local < inMs) amount = ease(active.easing, local / inMs);
  else if (outMs > 0 && local > active.duration - outMs)
    amount = ease(active.easing, (active.duration - local) / outMs);

  const scale = lerp(1, active.scale, amount);
  let target: Vec2;
  if (active.focus.mode === 'fixed') target = active.focus.point;
  else {
    // While transitioning in, aim at where the cursor will be once the zoom settles so the
    // camera does not swing; then follow.
    const probe = local < inMs ? active.start + inMs : t;
    target = focusAt?.(probe) ?? { x: 0.5, y: 0.5 };
  }
  const settled = clampCenter(target, active.scale);
  const center = clampCenter(
    { x: lerp(0.5, settled.x, amount), y: lerp(0.5, settled.y, amount) },
    scale,
  );
  return { scale, center, amount };
}

/** Map a normalized point of the screen recording into normalized viewport space. */
export function projectThroughCamera(p: Vec2, cam: CameraState): Vec2 {
  return { x: (p.x - cam.center.x) * cam.scale + 0.5, y: (p.y - cam.center.y) * cam.scale + 0.5 };
}
