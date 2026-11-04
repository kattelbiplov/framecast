import type { Asset, TimelineItem, Track } from '@framecast/schema';
import { collectSnapPoints, moveItem, snap, snapItemStart, trimItem, TRACK_ACCEPTS_FOR } from './ops';
import clsx from 'clsx';
import { Sparkles, Type, ZoomIn } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ANIMATION_DRAG_TYPE, applyAnimationToItem } from '../../editor/animation-dnd';
import { PEAKS_PER_SECOND, useWaveform } from '../../playback/waveform';
import { useEditor } from '../../stores/editor';
import { msToPx, pxToMs } from './geometry';

const COLORS: Record<string, string> = {
  video: 'bg-indigo-500/80 border-indigo-300/60',
  audio: 'bg-emerald-600/75 border-emerald-300/60',
  zoom: 'bg-amber-500/80 border-amber-200/60',
  text: 'bg-sky-500/80 border-sky-200/60',
  shape: 'bg-rose-500/80 border-rose-200/60',
};

const SNAP_PX = 8;

export function TimelineItemView({ item, track, asset, mediaUrl, pps, selected, snapping }: {
  item: TimelineItem; track: Track; asset?: Asset; mediaUrl?: string; pps: number; selected: boolean; snapping: boolean;
}) {
  const left = msToPx(item.start, pps);
  const width = Math.max(4, msToPx(item.duration, pps));
  const color = item.type === 'clip' ? COLORS[track.kind] : COLORS[item.type];
  const disabled = item.type === 'zoom' && item.disabled;

  const onPointerDown = (e: React.PointerEvent, mode: 'move' | 'start' | 'end') => {
    if (e.button !== 0 || track.locked) return;
    e.stopPropagation();
    const store = useEditor.getState();
    const sel = store.selection;
    if (e.shiftKey || e.metaKey) store.select(sel.includes(item.id) ? sel.filter((i) => i !== item.id) : [...sel, item.id]);
    else if (!sel.includes(item.id)) store.select([item.id]);
    const startX = e.clientX;
    const gesture = `drag-${item.id}-${Date.now()}`;
    const snapPoints = collectSnapPoints(store.project!.timeline, { exclude: new Set([item.id]), playhead: store.playhead });
    const threshold = pxToMs(SNAP_PX, pps);
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) < 3) return;
      moved = true;
      const dt = pxToMs(dx, pps);
      const s = useEditor.getState();
      if (mode === 'move') {
        const snapped = ev.altKey || !snapping ? { t: item.start + dt } : snapItemStart(item.start + dt, item.duration, snapPoints, threshold);
        const lane = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-track-id]');
        const targetId = lane?.dataset.trackId;
        const targetTrack = s.project!.timeline.tracks.find((t) => t.id === targetId);
        const toTrack = targetTrack && TRACK_ACCEPTS_FOR(targetTrack.kind, item.type) ? targetTrack.id : undefined;
        s.applyTimeline('Move', (tl) => moveItem(tl, item.id, Math.max(0, snapped.t), toTrack), gesture, { silent: true });
      } else {
        const edgeT = mode === 'start' ? item.start + dt : item.start + item.duration + dt;
        const t = ev.altKey || !snapping ? edgeT : snap(edgeT, snapPoints, threshold).t;
        s.applyTimeline('Trim', (tl) => trimItem(tl, item.id, mode, t, asset?.durationMs), gesture, { silent: true });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      role="button" tabIndex={0} aria-label={label(item, asset)} aria-pressed={selected}
      onPointerDown={(e) => onPointerDown(e, 'move')}
      onKeyDown={(e) => e.key === 'Enter' && useEditor.getState().select([item.id])}
      onDragOver={(e) => (item.type === 'text' || item.type === 'shape') && e.dataTransfer.types.includes(ANIMATION_DRAG_TYPE) && e.preventDefault()}
      onDrop={(e) => {
        const presetId = e.dataTransfer.getData(ANIMATION_DRAG_TYPE);
        if (!presetId) return;
        e.preventDefault();
        // Dropped on the right half → exit animation, left half → entrance.
        const r = e.currentTarget.getBoundingClientRect();
        applyAnimationToItem(item.id, presetId, e.clientX - r.left > r.width / 2 ? 'out' : 'in');
        useEditor.getState().select([item.id]);
      }}
      className={clsx(
        'absolute top-1 bottom-1 overflow-hidden rounded-md border text-white shadow-sm',
        color, selected && 'ring-2 ring-white ring-offset-1 ring-offset-accent', disabled && 'opacity-40 [background-image:repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(0,0,0,.15)_6px,rgba(0,0,0,.15)_12px)]',
        track.locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing',
      )}
      style={{ left, width }}
    >
      {item.type === 'clip' && track.kind === 'audio' && <Waveform url={mediaUrl} item={item} width={width} />}
      <div className="pointer-events-none relative flex h-full items-center gap-1 px-2 text-2xs font-medium">
        {item.type === 'zoom' && (item.origin === 'auto' ? <Sparkles size={11} /> : <ZoomIn size={11} />)}
        {item.type === 'text' && <Type size={11} />}
        <span className="truncate drop-shadow">{label(item, asset)}</span>
        {item.type === 'clip' && item.speed !== 1 && <span className="rounded bg-black/30 px-1">{item.speed}×</span>}
      </div>
      {!track.locked && (
        <>
          <div className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize hover:bg-white/40" onPointerDown={(e) => onPointerDown(e, 'start')} />
          <div className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize hover:bg-white/40" onPointerDown={(e) => onPointerDown(e, 'end')} />
        </>
      )}
    </div>
  );
}

function label(item: TimelineItem, asset?: Asset): string {
  switch (item.type) {
    case 'clip':
      return item.freezeFrame ? `Freeze · ${asset?.name ?? ''}` : asset?.name ?? 'Clip';
    case 'zoom':
      return `${item.scale.toFixed(1)}× ${item.focus.mode === 'followCursor' ? 'follow' : 'fixed'}`;
    case 'text':
      return item.text.split('\n')[0] || 'Text';
    case 'shape':
      return item.label || item.shape;
  }
}

function Waveform({ url, item, width }: { url?: string; item: Extract<TimelineItem, { type: 'clip' }>; width: number }) {
  const peaks = useWaveform(url, true);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !peaks) return;
    const h = c.clientHeight;
    const w = Math.min(4000, Math.ceil(width));
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let x = 0; x < w; x++) {
      const srcMs = item.sourceIn + ((x / w) * item.duration * item.speed);
      const v = (peaks[Math.floor((srcMs / 1000) * PEAKS_PER_SECOND)] ?? 0) * item.volume;
      const bh = Math.max(1, Math.min(1, v) * h * 0.9);
      g.fillRect(x, (h - bh) / 2, 1, bh);
    }
  }, [peaks, width, item.sourceIn, item.duration, item.speed, item.volume]);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />;
}
