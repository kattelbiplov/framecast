import { z } from 'zod';

/** All times in the data model are integer-ish milliseconds. */
export const Ms = z.number().finite().nonnegative();
export const Id = z.string().min(1);

/** Normalized 0..1 coordinates relative to the captured surface. */
export const Vec2 = z.object({ x: z.number().finite(), y: z.number().finite() });
export type Vec2 = z.infer<typeof Vec2>;

export const Rect = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
});
export type Rect = z.infer<typeof Rect>;

export const Size = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Size = z.infer<typeof Size>;

/** CSS-compatible color string (#rrggbb, #rrggbbaa, rgb(), hsl()). */
export const Color = z.string().min(1);
export type Color = z.infer<typeof Color>;

export function newId(prefix = ''): string {
  const uuid = globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return prefix ? `${prefix}_${uuid}` : uuid;
}
