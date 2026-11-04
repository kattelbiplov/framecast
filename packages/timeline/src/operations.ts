import { TRACK_ACCEPTS, newId, type ClipItem, type Timeline, type TimelineItem, type Track } from '@framecast/schema';
import { TimelineError } from './errors.js';
import { clipSourceSpan, findItem, itemEnd, overlaps, requireItem, requireTrack } from './query.js';

const MIN_DURATION = 33; // ~1 frame at 30 fps

/* ---------------------------------------------------------------- helpers */

function mapTrack(timeline: Timeline, trackId: string, fn: (t: Track) => Track): Timeline {
  return { ...timeline, tracks: timeline.tracks.map((t) => (t.id === trackId ? fn(t) : t)) };
}

function replaceItem(timeline: Timeline, item: TimelineItem): Timeline {
  const loc = requireItem(timeline, item.id);
  return mapTrack(timeline, loc.track.id, (t) => ({
    ...t,
    items: sortItems(t.items.map((i) => (i.id === item.id ? item : i))),
  }));
}

const sortItems = (items: TimelineItem[]) => [...items].sort((a, b) => a.start - b.start);

function assertEditable(track: Track): void {
  if (track.locked) throw new TimelineError(`Track "${track.name}" is locked`, 'locked');
}

function assertNoOverlap(track: Track, candidate: TimelineItem, ignore: ReadonlySet<string> = new Set()): void {
  for (const other of track.items) {
    if (other.id === candidate.id || ignore.has(other.id)) continue;
    if (overlaps(candidate, other)) throw new TimelineError('Items cannot overlap on the same track', 'overlap');
  }
}

function assertAccepts(track: Track, item: TimelineItem): void {
  if (!TRACK_ACCEPTS[track.kind].includes(item.type)) {
    throw new TimelineError(`A ${track.kind} track cannot hold ${item.type} items`, 'incompatible');
  }
}

/* ---------------------------------------------------------------- tracks */

export function addTrack(timeline: Timeline, kind: Track['kind'], name: string, index?: number): Timeline {
  const track: Track = { id: newId('trk'), kind, name, muted: false, locked: false, hidden: false, volume: 1, items: [] };
  const tracks = [...timeline.tracks];
  tracks.splice(index ?? tracks.length, 0, track);
  return { ...timeline, tracks };
}

export function removeTrack(timeline: Timeline, trackId: string): Timeline {
  requireTrack(timeline, trackId);
  return { ...timeline, tracks: timeline.tracks.filter((t) => t.id !== trackId) };
}

export function updateTrack(timeline: Timeline, trackId: string, patch: Partial<Omit<Track, 'id' | 'items' | 'kind'>>): Timeline {
  requireTrack(timeline, trackId);
  return mapTrack(timeline, trackId, (t) => ({ ...t, ...patch }));
}

/* ---------------------------------------------------------------- items */

/** First start ≥ `from` where an item of `duration` fits on the track. */
export function findFreeStart(track: Track, from: number, duration: number): number {
  let start = Math.max(0, from);
  for (const item of sortItems(track.items)) {
    if (overlaps({ start, duration }, item)) start = itemEnd(item);
  }
  return start;
}

export function addItem(timeline: Timeline, trackId: string, item: TimelineItem, opts: { autoPlace?: boolean } = {}): Timeline {
  const track = requireTrack(timeline, trackId);
  assertEditable(track);
  assertAccepts(track, item);
  if (item.duration < MIN_DURATION) throw new TimelineError('Item is too short', 'invalid');
  const placed = opts.autoPlace ? { ...item, start: findFreeStart(track, item.start, item.duration) } : item;
  assertNoOverlap(track, placed);
  return mapTrack(timeline, trackId, (t) => ({ ...t, items: sortItems([...t.items, placed]) }));
}

export function updateItem<T extends TimelineItem>(timeline: Timeline, itemId: string, patch: Partial<Omit<T, 'id' | 'type'>>): Timeline {
  const loc = requireItem(timeline, itemId);
  assertEditable(loc.track);
  const next = { ...loc.item, ...patch } as TimelineItem;
  if (next.duration < MIN_DURATION) throw new TimelineError('Item is too short', 'invalid');
  assertNoOverlap(loc.track, next);
  return replaceItem(timeline, next);
}

export function removeItems(timeline: Timeline, itemIds: readonly string[], opts: { ripple?: boolean } = {}): Timeline {
  const ids = new Set(itemIds);
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => {
      const removed = track.items.filter((i) => ids.has(i.id));
      if (removed.length === 0) return track;
      assertEditable(track);
      let items = track.items.filter((i) => !ids.has(i.id));
      if (opts.ripple) {
        // Shift each remaining item left by the total duration of removed items before it.
        items = items.map((i) => {
          const shift = removed.filter((r) => itemEnd(r) <= i.start).reduce((a, r) => a + r.duration, 0);
          return shift ? { ...i, start: i.start - shift } : i;
        });
      }
      return { ...track, items };
    }),
  };
}

export function moveItem(timeline: Timeline, itemId: string, newStart: number, toTrackId?: string): Timeline {
  const loc = requireItem(timeline, itemId);
  assertEditable(loc.track);
  const target = toTrackId ? requireTrack(timeline, toTrackId) : loc.track;
  assertEditable(target);
  const moved = { ...loc.item, start: Math.max(0, newStart) };
  assertAccepts(target, moved);
  assertNoOverlap(target, moved);
  if (target.id === loc.track.id) return replaceItem(timeline, moved);
  const without = mapTrack(timeline, loc.track.id, (t) => ({ ...t, items: t.items.filter((i) => i.id !== itemId) }));
  return mapTrack(without, target.id, (t) => ({ ...t, items: sortItems([...t.items, moved]) }));
}

/**
 * Trim an item's start or end edge to timeline time `t`. For clips the source in-point is
 * adjusted so the content stays anchored, constrained by `sourceDuration` when known.
 */
export function trimItem(
  timeline: Timeline,
  itemId: string,
  edge: 'start' | 'end',
  t: number,
  sourceDuration?: number,
): Timeline {
  const loc = requireItem(timeline, itemId);
  assertEditable(loc.track);
  const item = loc.item;
  const end = itemEnd(item);
  if (edge === 'end') {
    let newEnd = Math.max(item.start + MIN_DURATION, t);
    if (item.type === 'clip' && sourceDuration !== undefined && !item.freezeFrame && !item.reverse) {
      newEnd = Math.min(newEnd, item.start + (sourceDuration - item.sourceIn) / item.speed);
    }
    return updateItem(timeline, itemId, { duration: newEnd - item.start });
  }
  let newStart = Math.min(Math.max(0, t), end - MIN_DURATION);
  if (item.type === 'clip' && !item.freezeFrame) {
    const minStart = item.start - item.sourceIn / item.speed; // can't reveal before source frame 0
    newStart = Math.max(newStart, minStart);
    const delta = newStart - item.start;
    return updateItem<ClipItem>(timeline, itemId, {
      start: newStart,
      duration: end - newStart,
      sourceIn: item.reverse ? item.sourceIn : Math.max(0, item.sourceIn + delta * item.speed),
    });
  }
  return updateItem(timeline, itemId, { start: newStart, duration: end - newStart });
}

/** Split one item at timeline time t. Returns the new timeline and the right-hand item id. */
export function splitItem(timeline: Timeline, itemId: string, t: number): { timeline: Timeline; rightId: string } {
  const loc = requireItem(timeline, itemId);
  assertEditable(loc.track);
  const item = loc.item;
  if (t <= item.start + MIN_DURATION || t >= itemEnd(item) - MIN_DURATION) {
    throw new TimelineError('Split point is too close to the item edge', 'invalid');
  }
  const leftDuration = t - item.start;
  const rightDuration = item.duration - leftDuration;
  let left: TimelineItem = { ...item, duration: leftDuration };
  let right: TimelineItem = { ...item, id: newId(item.type), start: t, duration: rightDuration };
  if (item.type === 'clip') {
    // Forward clips: the right half starts later in the source. Reverse clips play the source
    // backwards, so the *left* half covers the later part of the source instead.
    const leftSpan = item.freezeFrame ? 0 : leftDuration * item.speed;
    const rightSpan = item.freezeFrame ? 0 : rightDuration * item.speed;
    left = { ...item, duration: leftDuration, fadeOutMs: 0, sourceIn: item.reverse ? item.sourceIn + rightSpan : item.sourceIn };
    right = {
      ...item,
      id: right.id,
      start: t,
      duration: rightDuration,
      fadeInMs: 0,
      transitionIn: null,
      sourceIn: item.reverse ? item.sourceIn : item.sourceIn + leftSpan,
    };
  }
  const next = mapTrack(timeline, loc.track.id, (tr) => ({
    ...tr,
    items: sortItems([...tr.items.filter((i) => i.id !== itemId), left, right]),
  }));
  return { timeline: next, rightId: right.id };
}

/** Split every unlocked item under the playhead (the "blade all" tool). */
export function splitAllAt(timeline: Timeline, t: number): Timeline {
  let next = timeline;
  for (const track of timeline.tracks) {
    if (track.locked) continue;
    for (const item of track.items) {
      if (t > item.start + MIN_DURATION && t < itemEnd(item) - MIN_DURATION) {
        next = splitItem(next, item.id, t).timeline;
      }
    }
  }
  return next;
}

/** Remove the time range [from, to) from all unlocked tracks and close the gap. */
export function deleteRange(timeline: Timeline, from: number, to: number): Timeline {
  if (to - from < 1) return timeline;
  let next = splitAllAt(splitAllAt(timeline, from), to);
  const gap = to - from;
  next = {
    ...next,
    tracks: next.tracks.map((track) => {
      if (track.locked) return track;
      const items = track.items
        .filter((i) => !(i.start >= from - 1e-6 && itemEnd(i) <= to + 1e-6))
        .map((i) => (i.start >= to - 1e-6 ? { ...i, start: i.start - gap } : i));
      return { ...track, items };
    }),
    markers: next.markers
      .filter((m) => m.t < from || m.t >= to)
      .map((m) => (m.t >= to ? { ...m, t: m.t - gap } : m)),
  };
  return next;
}

export function duplicateItem(timeline: Timeline, itemId: string): { timeline: Timeline; newId: string } {
  const loc = requireItem(timeline, itemId);
  const copy = { ...structuredClone(loc.item), id: newId(loc.item.type), start: itemEnd(loc.item) } as TimelineItem;
  const next = addItem(timeline, loc.track.id, copy, { autoPlace: true });
  return { timeline: next, newId: copy.id };
}

/** Change clip speed, keeping the source span (so duration changes). */
export function setClipSpeed(timeline: Timeline, itemId: string, speed: number): Timeline {
  const loc = requireItem(timeline, itemId);
  if (loc.item.type !== 'clip') throw new TimelineError('Only clips have a speed', 'incompatible');
  const span = clipSourceSpan(loc.item);
  const duration = loc.item.freezeFrame ? loc.item.duration : span / speed;
  return updateItem<ClipItem>(timeline, itemId, { speed, duration });
}

/** Turn the frame at time t into a freeze-frame segment of `holdMs`, splitting the clip. */
export function insertFreezeFrame(timeline: Timeline, itemId: string, t: number, holdMs: number): Timeline {
  const { timeline: split, rightId } = splitItem(timeline, itemId, t);
  const right = requireItem(split, rightId);
  if (right.item.type !== 'clip') throw new TimelineError('Only clips can freeze', 'incompatible');
  const freeze: ClipItem = { ...right.item, id: newId('clip'), freezeFrame: true, duration: holdMs, transitionIn: null };
  // Shift everything after t on this track to make room.
  const shifted = {
    ...split,
    tracks: split.tracks.map((tr) =>
      tr.id === right.track.id
        ? { ...tr, items: tr.items.map((i) => (i.start >= t - 1e-6 ? { ...i, start: i.start + holdMs } : i)) }
        : tr,
    ),
  };
  return addItem(shifted, right.track.id, { ...freeze, start: t });
}

/* ---------------------------------------------------------------- groups */

export function groupItems(timeline: Timeline, itemIds: readonly string[]): Timeline {
  if (itemIds.length < 2) return timeline;
  const groupId = newId('grp');
  return mapItems(timeline, new Set(itemIds), (i) => ({ ...i, groupId }));
}

export function ungroupItems(timeline: Timeline, groupId: string): Timeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map((t) => ({
      ...t,
      items: t.items.map((i) => (i.groupId === groupId ? { ...i, groupId: undefined } : i)),
    })),
  };
}

/** Expand a selection to include all members of any selected group. */
export function expandGroupSelection(timeline: Timeline, itemIds: readonly string[]): string[] {
  const groups = new Set(itemIds.map((id) => findItem(timeline, id)?.item.groupId).filter(Boolean));
  const out = new Set(itemIds);
  for (const t of timeline.tracks) for (const i of t.items) if (i.groupId && groups.has(i.groupId)) out.add(i.id);
  return [...out];
}

function mapItems(timeline: Timeline, ids: ReadonlySet<string>, fn: (i: TimelineItem) => TimelineItem): Timeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map((t) => ({ ...t, items: t.items.map((i) => (ids.has(i.id) ? fn(i) : i)) })),
  };
}
