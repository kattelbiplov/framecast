import type { Track } from '@framecast/schema';
import { addTrack, updateTrack } from '@framecast/timeline';
import clsx from 'clsx';
import { Captions, Eye, EyeOff, Lock, Magnet, Plus, Scissors, Trash2, Unlock, Volume2, VolumeX } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { commands } from '../../editor/commands';
import { formatTime } from '../../lib/format';
import { useEditor } from '../../stores/editor';
import { IconButton } from '../ui/Button';
import { Slider } from '../ui/controls';
import { LABEL_WIDTH, ROW_HEIGHT, RULER_HEIGHT, msToPx, pxToMs, rulerStep } from './geometry';
import { TimelineItemView } from './TimelineItemView';

/** Display order: visual layers top-most first, then audio. */
function displayOrder(tracks: readonly Track[]): Track[] {
  const visual = tracks.filter((t) => t.kind !== 'audio').reverse();
  return [...visual, ...tracks.filter((t) => t.kind === 'audio')];
}

export function Timeline() {
  const project = useEditor((s) => s.project)!;
  const pps = useEditor((s) => s.pxPerSecond);
  const duration = useEditor((s) => s.duration);
  const selection = useEditor((s) => s.selection);
  const mediaUrls = useEditor((s) => s.mediaUrls);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [snapping, setSnapping] = useState(true);
  const tracks = useMemo(() => displayOrder(project.timeline.tracks), [project.timeline.tracks]);
  const assets = useMemo(() => new Map(project.assets.map((a) => [a.id, a])), [project.assets]);
  const contentWidth = msToPx(duration + 10_000, pps);
  const subtitle = project.subtitles[0];

  const seekFromEvent = (e: React.PointerEvent | PointerEvent, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    useEditor.getState().seek(pxToMs(e.clientX - rect.left, pps));
  };
  const onScrubStart = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    useEditor.getState().setPlaying(false);
    seekFromEvent(e, el);
    const move = (ev: PointerEvent) => seekFromEvent(ev, el);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    useEditor.getState().setPxPerSecond(pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  };

  const setTrack = (id: string, patch: Partial<Track>, label: string) => useEditor.getState().applyTimeline(label, (tl) => updateTrack(tl, id, patch));

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
        <IconButton size="sm" label="Split (S)" onClick={commands.split}><Scissors size={14} /></IconButton>
        <IconButton size="sm" label="Delete (⌫)" disabled={selection.length === 0} onClick={() => commands.deleteSelection()}><Trash2 size={14} /></IconButton>
        <IconButton size="sm" label={snapping ? 'Snapping on (hold ⌥ to bypass)' : 'Snapping off'} active={snapping} onClick={() => setSnapping(!snapping)}><Magnet size={14} /></IconButton>
        <IconButton size="sm" label="Add overlay video track" onClick={() => useEditor.getState().applyTimeline('Add track', (tl) => addTrack(tl, 'video', `Overlay ${tl.tracks.length}`, 1))}><Plus size={14} /></IconButton>
        <div className="flex-1" />
        <span className="text-2xs text-muted">Zoom</span>
        <div className="w-36"><Slider label="Timeline zoom" min={5} max={600} step={1} value={pps} onChange={(v) => useEditor.getState().setPxPerSecond(v)} format={(v) => `${Math.round(v)}px/s`} /></div>
      </div>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto" onWheel={onWheel}>
        <div className="relative" style={{ width: LABEL_WIDTH + contentWidth }}>
          {/* Ruler */}
          <div className="sticky top-0 z-20 flex border-b border-border bg-panel" style={{ height: RULER_HEIGHT }}>
            <div className="sticky left-0 z-10 shrink-0 border-r border-border bg-panel" style={{ width: LABEL_WIDTH }} />
            <div className="relative flex-1 cursor-ew-resize" onPointerDown={onScrubStart}>
              <Ruler pps={pps} width={contentWidth} />
            </div>
          </div>

          {tracks.map((track) => (
            <div key={track.id} className="flex border-b border-border/70" style={{ height: ROW_HEIGHT }}>
              <div className="sticky left-0 z-10 flex shrink-0 items-center gap-0.5 border-r border-border bg-panel pl-2 pr-1" style={{ width: LABEL_WIDTH }}>
                <span className="flex-1 truncate text-xs" title={track.name}>{track.name}</span>
                {(track.kind === 'audio' || track.kind === 'video') && (
                  <IconButton size="sm" label={track.muted ? 'Unmute track' : 'Mute track'} active={track.muted} onClick={() => setTrack(track.id, { muted: !track.muted }, 'Mute track')}>
                    {track.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                  </IconButton>
                )}
                {track.kind !== 'audio' && (
                  <IconButton size="sm" label={track.hidden ? 'Show track' : 'Hide track'} active={track.hidden} onClick={() => setTrack(track.id, { hidden: !track.hidden }, 'Hide track')}>
                    {track.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                  </IconButton>
                )}
                <IconButton size="sm" label={track.locked ? 'Unlock track' : 'Lock track'} active={track.locked} onClick={() => setTrack(track.id, { locked: !track.locked }, 'Lock track')}>
                  {track.locked ? <Lock size={12} /> : <Unlock size={12} />}
                </IconButton>
              </div>
              <div
                data-track-id={track.id}
                className={clsx('relative flex-1', track.hidden && 'opacity-50')}
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget) {
                    useEditor.getState().select([]);
                    onScrubStart(e);
                  }
                }}
              >
                {track.items.map((item) => (
                  <TimelineItemView key={item.id} item={item} track={track} pps={pps} selected={selection.includes(item.id)} snapping={snapping}
                    asset={item.type === 'clip' ? assets.get(item.assetId) : undefined}
                    mediaUrl={item.type === 'clip' ? mediaUrls[item.assetId] : undefined} />
                ))}
              </div>
            </div>
          ))}

          {subtitle && (
            <div className="flex border-b border-border/70" style={{ height: ROW_HEIGHT - 8 }}>
              <div className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-border bg-panel px-2 text-xs" style={{ width: LABEL_WIDTH }}>
                <Captions size={12} className="text-muted" /> {subtitle.label}
              </div>
              <div className="relative flex-1">
                {subtitle.cues.map((cue) => (
                  <button key={cue.id} type="button" title={cue.text}
                    onClick={() => {
                      useEditor.getState().selectCue(cue.id);
                      useEditor.getState().setTab('captions');
                      useEditor.getState().seek(cue.start);
                    }}
                    className="absolute top-1 bottom-1 truncate rounded bg-violet-500/70 px-1.5 text-left text-2xs text-white hover:bg-violet-500"
                    style={{ left: msToPx(cue.start, pps), width: Math.max(4, msToPx(cue.end - cue.start, pps)) }}
                  >
                    {cue.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Playhead pps={pps} />
        </div>
      </div>
    </div>
  );
}

function Ruler({ pps, width }: { pps: number; width: number }) {
  const step = rulerStep(pps);
  const ticks: number[] = [];
  for (let t = 0; msToPx(t, pps) <= width; t += step) ticks.push(t);
  return (
    <>
      {ticks.map((t) => (
        <div key={t} className="absolute top-0 h-full border-l border-border" style={{ left: msToPx(t, pps) }}>
          <span className="ml-1 text-2xs tabular-nums text-muted">{formatTime(t)}{step < 1000 ? `.${String(t % 1000).padStart(3, '0').slice(0, 1)}` : ''}</span>
        </div>
      ))}
    </>
  );
}

function Playhead({ pps }: { pps: number }) {
  const playhead = useEditor((s) => s.playhead);
  return (
    <div className="pointer-events-none absolute top-0 bottom-0 z-30" style={{ left: LABEL_WIDTH + msToPx(playhead, pps) }}>
      <div className="-ml-[5px] h-3 w-[11px] rounded-b-sm bg-red-500" />
      <div className="h-full w-px bg-red-500" />
    </div>
  );
}
