import { createProject, type ClipItem, type Timeline } from '@framecast/schema';
import { describe, expect, it } from 'vitest';
import {
  History,
  TimelineError,
  addItem,
  clipSourceTime,
  collectSnapPoints,
  deleteRange,
  duplicateItem,
  findItem,
  insertFreezeFrame,
  moveItem,
  removeItems,
  setClipSpeed,
  snapItemStart,
  splitItem,
  timelineDuration,
  trimItem,
} from './index.js';

const clip = (id: string, start: number, duration: number, extra: Partial<ClipItem> = {}): ClipItem => ({
  id, type: 'clip', assetId: 'a', start, duration, sourceIn: 0, speed: 1, reverse: false, freezeFrame: false,
  volume: 1, muted: false, fadeInMs: 0, fadeOutMs: 0, transitionIn: null,
  crop: { top: 0, right: 0, bottom: 0, left: 0 }, color: { brightness: 1, contrast: 1, saturation: 1 }, keyframes: {},
  ...extra,
});

function setup(): { tl: Timeline; video: string; audio: string } {
  const tl = createProject('t').timeline;
  const video = tl.tracks.find((t) => t.kind === 'video')!.id;
  const audio = tl.tracks.find((t) => t.kind === 'audio')!.id;
  return { tl: addItem(addItem(tl, video, clip('c1', 0, 4000)), video, clip('c2', 4000, 2000, { sourceIn: 4000 })), video, audio };
}

describe('timeline operations', () => {
  it('rejects overlaps and incompatible tracks', () => {
    const { tl, video } = setup();
    expect(() => addItem(tl, video, clip('x', 1000, 1000))).toThrow(TimelineError);
    const zoomTrack = tl.tracks.find((t) => t.kind === 'zoom')!.id;
    expect(() => addItem(tl, zoomTrack, clip('x', 9000, 1000))).toThrow(/cannot hold/);
    const placed = addItem(tl, video, clip('x', 1000, 1000), { autoPlace: true });
    expect(findItem(placed, 'x')!.item.start).toBe(6000);
  });

  it('splits clips with correct source mapping', () => {
    const { tl } = setup();
    const { timeline, rightId } = splitItem(tl, 'c1', 1500);
    const right = findItem(timeline, rightId)!.item as ClipItem;
    expect(right.start).toBe(1500);
    expect(right.sourceIn).toBe(1500);
    expect(findItem(timeline, 'c1')!.item.duration).toBe(1500);
  });

  it('splits reverse clips so playback stays continuous', () => {
    const { tl } = setup();
    const rev = removeItems(tl, ['c2']);
    const reversed = { ...rev, tracks: rev.tracks.map((t) => ({ ...t, items: t.items.map((i) => (i.id === 'c1' ? { ...i, reverse: true } : i)) })) };
    const before = clipSourceTime(findItem(reversed, 'c1')!.item as ClipItem, 1000);
    const { timeline, rightId } = splitItem(reversed, 'c1', 2000);
    const left = findItem(timeline, 'c1')!.item as ClipItem;
    const right = findItem(timeline, rightId)!.item as ClipItem;
    expect(clipSourceTime(left, 1000)).toBe(before);
    expect(clipSourceTime(right, 2000)).toBe(2000);
    expect(clipSourceTime(right, 4000)).toBe(0);
  });

  it('trims start while keeping content anchored', () => {
    const { tl } = setup();
    const next = trimItem(tl, 'c2', 'start', 4500);
    const c2 = findItem(next, 'c2')!.item as ClipItem;
    expect(c2.start).toBe(4500);
    expect(c2.sourceIn).toBe(4500);
    expect(c2.duration).toBe(1500);
    // cannot reveal before source frame 0
    const c1 = findItem(trimItem(tl, 'c1', 'start', 0), 'c1')!.item as ClipItem;
    expect(c1.sourceIn).toBe(0);
    // end trim respects source duration
    expect(findItem(trimItem(tl, 'c2', 'end', 99999, 6000), 'c2')!.item.duration).toBe(2000);
  });

  it('ripple deletes and deletes ranges', () => {
    const { tl } = setup();
    expect(findItem(removeItems(tl, ['c1'], { ripple: true }), 'c2')!.item.start).toBe(0);
    const cut = deleteRange(tl, 1000, 2000);
    expect(timelineDuration(cut)).toBe(5000);
  });

  it('changes speed, freezes, duplicates and moves', () => {
    const { tl, video, audio } = setup();
    expect(findItem(setClipSpeed(tl, 'c2', 2), 'c2')!.item.duration).toBe(1000);
    expect(timelineDuration(insertFreezeFrame(tl, 'c1', 1000, 500))).toBe(6500);
    const dup = duplicateItem(tl, 'c2');
    expect(findItem(dup.timeline, dup.newId)!.item.start).toBe(6000);
    const moved = moveItem(tl, 'c2', 8000, audio);
    expect(findItem(moved, 'c2')!.track.id).toBe(audio);
    expect(() => moveItem(tl, 'c2', 100, video)).toThrow(/overlap/);
  });

  it('maps timeline to source time with speed', () => {
    const c = clip('s', 1000, 1000, { sourceIn: 500, speed: 2 });
    expect(clipSourceTime(c, 1500)).toBe(1500);
    expect(clipSourceTime(c, 3000)).toBeNull();
  });
});

describe('snapping', () => {
  it('snaps either edge', () => {
    const { tl } = setup();
    const pts = collectSnapPoints(tl, { exclude: new Set(['c2']) });
    expect(snapItemStart(3950, 1000, pts, 100)).toMatchObject({ t: 4000, snapped: true });
    expect(snapItemStart(3060, 1000, pts, 100)).toMatchObject({ t: 3000, snapped: true });
    expect(snapItemStart(2000, 500, pts, 100).snapped).toBe(false);
  });
});

describe('history', () => {
  it('undoes, redoes and coalesces', () => {
    const h = new History(0);
    h.commit(1, 'a', undefined, 0);
    h.commit(2, 'drag', 'k', 1000);
    h.commit(3, 'drag', 'k', 1100);
    expect(h.undo()).toBe(1);
    expect(h.redo()).toBe(3);
    h.undo();
    h.commit(9, 'b', undefined, 5000);
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBe(1);
    expect(h.undo()).toBe(0);
    expect(h.canUndo).toBe(false);
  });
});
