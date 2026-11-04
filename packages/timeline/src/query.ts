import type { ClipItem, Timeline, TimelineItem, Track } from '@framecast/schema';
import { TimelineError } from './errors.js';

export const itemEnd = (item: Pick<TimelineItem, 'start' | 'duration'>): number => item.start + item.duration;

export function timelineDuration(timeline: Timeline): number {
  let end = 0;
  for (const track of timeline.tracks) for (const item of track.items) end = Math.max(end, itemEnd(item));
  return end;
}

export interface ItemLocation {
  track: Track;
  trackIndex: number;
  item: TimelineItem;
  itemIndex: number;
}

export function findItem(timeline: Timeline, itemId: string): ItemLocation | null {
  for (let ti = 0; ti < timeline.tracks.length; ti++) {
    const track = timeline.tracks[ti]!;
    const ii = track.items.findIndex((i) => i.id === itemId);
    if (ii >= 0) return { track, trackIndex: ti, item: track.items[ii]!, itemIndex: ii };
  }
  return null;
}

export function requireItem(timeline: Timeline, itemId: string): ItemLocation {
  const loc = findItem(timeline, itemId);
  if (!loc) throw new TimelineError(`Item ${itemId} not found`, 'not_found');
  return loc;
}

export function requireTrack(timeline: Timeline, trackId: string): Track {
  const track = timeline.tracks.find((t) => t.id === trackId);
  if (!track) throw new TimelineError(`Track ${trackId} not found`, 'not_found');
  return track;
}

/** Items on non-hidden tracks overlapping time t, ordered bottom→top. */
export function itemsAt(timeline: Timeline, t: number): { track: Track; item: TimelineItem }[] {
  const out: { track: Track; item: TimelineItem }[] = [];
  for (const track of timeline.tracks) {
    if (track.hidden) continue;
    for (const item of track.items) if (t >= item.start && t < itemEnd(item)) out.push({ track, item });
  }
  return out;
}

/** Span of source media (ms) a clip consumes. */
export const clipSourceSpan = (clip: ClipItem): number => (clip.freezeFrame ? 0 : clip.duration * clip.speed);

/**
 * Map timeline time to source media time for a clip, accounting for speed, reverse and freeze.
 * Returns null when t lies outside the clip.
 */
export function clipSourceTime(clip: ClipItem, t: number): number | null {
  if (t < clip.start || t > itemEnd(clip)) return null;
  if (clip.freezeFrame) return clip.sourceIn;
  const local = (t - clip.start) * clip.speed;
  return clip.reverse ? clip.sourceIn + clipSourceSpan(clip) - local : clip.sourceIn + local;
}

export function overlaps(a: { start: number; duration: number }, b: { start: number; duration: number }): boolean {
  return a.start < itemEnd(b) - 1e-6 && b.start < itemEnd(a) - 1e-6;
}
