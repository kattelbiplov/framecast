import type { ShapeKind, TimelineItem, Track } from '@framecast/schema';
import { addItem, duplicateItem, expandGroupSelection, findItem, removeItems, splitAllAt, splitItem } from '@framecast/timeline';
import { generateAutoZooms, getZoomPreset } from '@framecast/zoom';
import { toast } from '../stores/app';
import { useEditor } from '../stores/editor';
import { TEXT_PRESETS, makeShape, makeZoom } from './factories';

const ed = () => useEditor.getState();

function trackFor(kind: Track['kind']): Track | undefined {
  return ed().project?.timeline.tracks.find((t) => t.kind === kind && !t.locked);
}

/** Insert an item on the first unlocked track of `kind`, placed at the first free spot ≥ start. */
export function insertItem(kind: Track['kind'], item: TimelineItem, label: string): void {
  const track = trackFor(kind);
  if (!track) return toast('error', `No unlocked ${kind} track`);
  if (ed().applyTimeline(label, (tl) => addItem(tl, track.id, item, { autoPlace: true }))) ed().select([item.id]);
}

export const commands = {
  togglePlay: () => ed().setPlaying(!ed().playing),
  undo: () => ed().undo(),
  redo: () => ed().redo(),

  split: () => {
    const { selection, playhead } = ed();
    if (selection.length === 0) return void ed().applyTimeline('Split', (tl) => splitAllAt(tl, playhead));
    ed().applyTimeline('Split', (tl) => {
      let next = tl;
      for (const id of selection) {
        const loc = findItem(next, id);
        if (loc && playhead > loc.item.start && playhead < loc.item.start + loc.item.duration) next = splitItem(next, id, playhead).timeline;
      }
      return next;
    });
  },

  deleteSelection: (ripple = false) => {
    const { selection, project } = ed();
    if (!project || selection.length === 0) return;
    const ids = expandGroupSelection(project.timeline, selection);
    if (ed().applyTimeline(ripple ? 'Ripple delete' : 'Delete', (tl) => removeItems(tl, ids, { ripple }))) ed().select([]);
  },

  duplicate: () => {
    const id = ed().selection[0];
    if (!id) return;
    let newId = '';
    ed().applyTimeline('Duplicate', (tl) => {
      const r = duplicateItem(tl, id);
      newId = r.newId;
      return r.timeline;
    });
    if (newId) ed().select([newId]);
  },

  addZoom: () => insertItem('zoom', makeZoom(ed().playhead), 'Add zoom'),
  addText: (presetId = 'title') => insertItem('text', TEXT_PRESETS.find((p) => p.id === presetId)!.make(ed().playhead), 'Add text'),
  addShape: (shape: ShapeKind) => insertItem('graphics', makeShape(shape, ed().playhead), `Add ${shape}`),

  /** Replace automatic zooms using a preset; manual zooms are kept untouched. */
  regenerateAutoZooms: (presetId: string) => {
    const { project, recordings } = ed();
    if (!project) return;
    const zoomTrack = project.timeline.tracks.find((t) => t.kind === 'zoom');
    const screenTrack = project.timeline.tracks.find((t) => t.kind === 'video');
    if (!zoomTrack || !screenTrack) return;
    ed().apply(`Auto zoom: ${getZoomPreset(presetId).name}`, (p) => {
      let tl = { ...p.timeline, tracks: p.timeline.tracks.map((t) => (t.id === zoomTrack.id ? { ...t, items: t.items.filter((i) => !(i.type === 'zoom' && i.origin === 'auto')) } : t)) };
      for (const clip of screenTrack.items) {
        if (clip.type !== 'clip') continue;
        const rec = recordings.get(p.assets.find((a) => a.id === clip.assetId)?.recordingId ?? '');
        if (!rec) continue;
        const zooms = generateAutoZooms(rec.events, getZoomPreset(presetId), { durationMs: clip.duration, timelineOffsetMs: clip.start - clip.sourceIn });
        for (const z of zooms) {
          if (z.start < clip.start || z.start + z.duration > clip.start + clip.duration) continue;
          try {
            tl = addItem(tl, zoomTrack.id, z);
          } catch {
            /* overlaps a manual zoom — the manual one wins */
          }
        }
      }
      return { ...p, timeline: tl, autoZoom: { enabled: true, presetId } };
    });
  },
};
