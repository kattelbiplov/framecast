import { Composition, CursorTrackCache } from '@framecast/compositor';
import type { Asset, Project, RecordingMetadata, Timeline } from '@framecast/schema';
import { History, TimelineError, timelineDuration } from '@framecast/timeline';
import { useMemo } from 'react';
import { create } from 'zustand';
import type { OpenedProject } from '../../../shared/ipc';
import { errorMessage } from '../lib/format';
import { invoke } from '../lib/ipc';
import { toast } from './app';

export type SidebarTab = 'media' | 'text' | 'captions' | 'animations' | 'background' | 'cursor' | 'zoom' | 'elements';

export interface ApplyOptions {
  /** Swallow errors (used during drags, where transient overlaps are expected). */
  silent?: boolean;
}

interface EditorStore {
  project: Project | null;
  dir: string;
  recordings: ReadonlyMap<string, RecordingMetadata>;
  mediaUrls: Record<string, string>;
  composition: Composition | null;
  canUndo: boolean;
  canRedo: boolean;
  selection: string[];
  selectedCueId: string | null;
  playhead: number;
  playing: boolean;
  duration: number;
  pxPerSecond: number;
  tab: SidebarTab;
  saveState: 'saved' | 'dirty' | 'saving' | 'error';
  previewMaximized: boolean;

  load(opened: OpenedProject): void;
  close(): void;
  /** Apply an edit through the undo history. Timeline errors become toasts, not crashes. */
  apply(label: string, fn: (p: Project) => Project, coalesceKey?: string, opts?: ApplyOptions): boolean;
  applyTimeline(label: string, fn: (t: Timeline) => Timeline, coalesceKey?: string, opts?: ApplyOptions): boolean;
  undo(): void;
  redo(): void;
  select(ids: string[]): void;
  selectCue(id: string | null): void;
  seek(t: number): void;
  setPlaying(playing: boolean): void;
  setPxPerSecond(v: number): void;
  setTab(tab: SidebarTab): void;
  addAssets(assets: Asset[], urls: Record<string, string>): void;
  save(): Promise<void>;
  togglePreviewMaximized(): void;
}

let history: History<Project> | null = null;
const cursorCache = new CursorTrackCache();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function derived(project: Project, recordings: ReadonlyMap<string, RecordingMetadata>) {
  return {
    composition: new Composition(project, recordings, cursorCache),
    duration: Math.max(1000, timelineDuration(project.timeline)),
    canUndo: history?.canUndo ?? false,
    canRedo: history?.canRedo ?? false,
  };
}

export const useEditor = create<EditorStore>((set, get) => {
  const commit = (next: Project) => {
    const s = get();
    set({ project: next, ...derived(next, s.recordings), saveState: 'dirty' });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void get().save(), 1500); // debounced autosave
  };

  return {
    project: null,
    dir: '',
    recordings: new Map(),
    mediaUrls: {},
    composition: null,
    canUndo: false,
    canRedo: false,
    selection: [],
    selectedCueId: null,
    playhead: 0,
    playing: false,
    duration: 1000,
    pxPerSecond: 80,
    tab: 'media',
    saveState: 'saved',
    previewMaximized: false,

    load: (opened) => {
      history = new History(opened.project);
      const recordings = new Map(opened.recordings.map((r) => [r.id, r]));
      set({
        project: opened.project, dir: opened.dir, recordings, mediaUrls: opened.mediaUrls,
        selection: [], selectedCueId: null, playhead: 0, playing: false, saveState: 'saved',
        ...derived(opened.project, recordings),
      });
    },
    close: () => {
      if (get().saveState === 'dirty') void get().save();
      history = null;
      set({ project: null, composition: null, playing: false });
    },
    apply: (label, fn, coalesceKey, opts) => {
      const current = get().project;
      if (!current || !history) return false;
      try {
        const next = fn(current);
        if (next === current) return true;
        history.commit(next, label, coalesceKey);
        commit(next);
        return true;
      } catch (e) {
        if (opts?.silent) return false;
        if (e instanceof TimelineError) toast('error', e.message);
        else toast('error', `${label} failed: ${errorMessage(e)}`);
        return false;
      }
    },
    applyTimeline: (label, fn, key, opts) => get().apply(label, (p) => ({ ...p, timeline: fn(p.timeline) }), key, opts),
    undo: () => {
      if (!history?.canUndo) return;
      commit(history.undo());
    },
    redo: () => {
      if (!history?.canRedo) return;
      commit(history.redo());
    },
    select: (selection) => set({ selection }),
    selectCue: (selectedCueId) => set({ selectedCueId }),
    seek: (t) => set({ playhead: Math.max(0, Math.min(t, get().duration)) }),
    setPlaying: (playing) => set({ playing }),
    setPxPerSecond: (v) => set({ pxPerSecond: Math.max(5, Math.min(800, v)) }),
    setTab: (tab) => set({ tab }),
    addAssets: (assets, urls) => {
      set({ mediaUrls: { ...get().mediaUrls, ...urls } });
      get().apply('Import media', (p) => ({ ...p, assets: [...p.assets, ...assets] }));
    },
    save: async () => {
      const project = get().project;
      if (!project) return;
      set({ saveState: 'saving' });
      try {
        await invoke('project:save', project);
        // Only mark saved if nothing changed while the save was in flight.
        if (get().project === project) set({ saveState: 'saved' });
        else set({ saveState: 'dirty' });
      } catch (e) {
        set({ saveState: 'error' });
        toast('error', `Could not save: ${errorMessage(e)}`);
      }
    },
    togglePreviewMaximized: () => set({ previewMaximized: !get().previewMaximized }),
  };
});

/** The currently selected timeline item (first of the selection) and its track. */
export function useSelectedItem() {
  const project = useEditor((s) => s.project);
  const id = useEditor((s) => s.selection[0]);
  return useMemo(() => {
    if (!id || !project) return null;
    for (const track of project.timeline.tracks) {
      const item = track.items.find((i) => i.id === id);
      if (item) return { track, item };
    }
    return null;
  }, [project, id]);
}
