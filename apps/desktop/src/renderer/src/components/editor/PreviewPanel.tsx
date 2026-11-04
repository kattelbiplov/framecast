import { composeFrame, type OverlayNode, type RenderTarget } from '@framecast/compositor';
import type { GraphicItem, ShapeItem, TextItem } from '@framecast/schema';
import { requireItem, updateItem } from '@framecast/timeline';
import { Maximize2, Minimize2, Pause, Play, Scissors, SkipBack, SkipForward, ZoomIn } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { commands } from '../../editor/commands';
import { formatTime } from '../../lib/format';
import { invoke } from '../../lib/ipc';
import { MediaPool } from '../../playback/media-pool';
import { PreviewPlayer, canvasTarget } from '../../playback/player';
import { useEditor } from '../../stores/editor';
import { IconButton } from '../ui/Button';

const MAX_PREVIEW_WIDTH = 1920;

export function PreviewPanel() {
  const project = useEditor((s) => s.project)!;
  const composition = useEditor((s) => s.composition)!;
  const mediaUrls = useEditor((s) => s.mediaUrls);
  const playing = useEditor((s) => s.playing);
  const maximized = useEditor((s) => s.previewMaximized);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<PreviewPlayer | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const { width: cw, height: ch } = project.canvas.size;

  const assets = useMemo(() => new Map(project.assets.map((a) => [a.id, a])), [project.assets]);
  const pool = useMemo(() => new MediaPool(mediaUrls, assets), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => pool.update(mediaUrls, assets), [pool, mediaUrls, assets]);
  useEffect(() => () => pool.dispose(), [pool]);

  // Fit the canvas into the available space, preserving the project aspect ratio.
  useEffect(() => {
    const el = containerRef.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const scale = Math.min((r.width - 32) / cw, (r.height - 32) / ch);
      setBox({ width: Math.max(1, Math.floor(cw * scale)), height: Math.max(1, Math.floor(ch * scale)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [cw, ch]);

  // Backing-store resolution: CSS size × devicePixelRatio, capped for performance.
  const target = useMemo<RenderTarget | null>(() => {
    const canvas = canvasRef.current;
    if (!canvas || box.width === 0) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_PREVIEW_WIDTH / box.width);
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    return canvasTarget(canvas);
  }, [box]);

  useEffect(() => {
    if (!target) return;
    const player = new PreviewPlayer(target, useEditor.getState().composition!, pool, {
      onTime: (t) => useEditor.setState({ playhead: t }),
      onEnded: () => useEditor.getState().setPlaying(false),
      getDuration: () => useEditor.getState().duration,
    });
    player.seek(useEditor.getState().playhead);
    playerRef.current = player;
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.playhead !== prev.playhead && !s.playing) player.seek(s.playhead);
    });
    return () => {
      unsub();
      player.dispose();
      playerRef.current = null;
    };
  }, [target, pool]);

  useEffect(() => playerRef.current?.setComposition(composition), [composition]);
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    if (playing) {
      p.seek(useEditor.getState().playhead);
      p.play();
    } else p.pause();
  }, [playing]);

  useThumbnail(playerRef, project.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <div ref={containerRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <div className="checker relative shadow-2xl ring-1 ring-black/10" style={{ width: box.width, height: box.height }}>
          <canvas ref={canvasRef} className="block h-full w-full" aria-label="Video preview" />
          <CanvasInteraction width={box.width} height={box.height} />
        </div>
      </div>
      <Transport maximized={maximized} />
    </div>
  );
}

/** Click to select overlays on the canvas; drag to move the selected text/shape. */
function CanvasInteraction({ width, height }: { width: number; height: number }) {
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = useEditor.getState();
    if (!s.composition || !s.project) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    const scene = composeFrame(s.composition, s.playhead);
    const hit = [...scene.overlays].reverse().find((o) => hitTest(o, nx, ny, s.project!.canvas.size));
    const id = hit && hit.kind !== 'video' ? hit.item.id : null;
    s.select(id ? [id] : []);
    if (!id) return;
    const loc = requireItem(s.project.timeline, id);
    const startItem = loc.item as TextItem | ShapeItem | GraphicItem;
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - e.clientX) / rect.width;
      const dy = (ev.clientY - e.clientY) / rect.height;
      useEditor.getState().applyTimeline('Move', (tl) =>
        startItem.type === 'text' || startItem.type === 'graphic'
          ? updateItem<TextItem>(tl, id, { transform: { ...startItem.transform, x: startItem.transform.x + dx, y: startItem.transform.y + dy } })
          : updateItem<ShapeItem>(tl, id, { from: { x: startItem.from.x + dx, y: startItem.from.y + dy }, to: { x: startItem.to.x + dx, y: startItem.to.y + dy } }),
        `move-${id}`, { silent: true });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return <div className="absolute inset-0 cursor-default" style={{ width, height }} onPointerDown={onPointerDown} />;
}

function hitTest(o: OverlayNode, x: number, y: number, size: { width: number; height: number }): boolean {
  if (o.kind === 'text') {
    const s = o.item.style;
    const lines = o.item.text.split('\n');
    const w = (Math.max(...lines.map((l) => l.length)) * s.fontSizePx * 0.56 * o.scale + s.backgroundPaddingPx * 2) / size.width;
    const h = (lines.length * s.fontSizePx * s.lineHeight * o.scale + s.backgroundPaddingPx * 2) / size.height;
    return Math.abs(x - o.x) <= w / 2 && Math.abs(y - o.y) <= h / 2;
  }
  if (o.kind === 'graphic') {
    const px = x * size.width;
    const py = y * size.height;
    const pad = 8;
    return px >= o.box.x - pad && px <= o.box.x + o.box.width + pad && py >= o.box.y - pad && py <= o.box.y + o.box.height + pad;
  }
  if (o.kind === 'shape') {
    const pad = 0.015;
    return x >= Math.min(o.from.x, o.to.x) - pad && x <= Math.max(o.from.x, o.to.x) + pad && y >= Math.min(o.from.y, o.to.y) - pad && y <= Math.max(o.from.y, o.to.y) + pad;
  }
  return false;
}

function Transport({ maximized }: { maximized: boolean }) {
  const playhead = useEditor((s) => s.playhead);
  const duration = useEditor((s) => s.duration);
  const playing = useEditor((s) => s.playing);
  const fps = useEditor((s) => s.project?.canvas.fps ?? 30);
  const seek = useEditor((s) => s.seek);
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-t border-border bg-panel px-3">
      <div className="flex w-56 items-center gap-1">
        <IconButton label="Split at playhead (S)" onClick={commands.split}><Scissors size={15} /></IconButton>
        <IconButton label="Add zoom (Z)" onClick={commands.addZoom}><ZoomIn size={15} /></IconButton>
      </div>
      <div className="flex flex-1 items-center justify-center gap-1">
        <IconButton label="Go to start" onClick={() => seek(0)}><SkipBack size={15} /></IconButton>
        <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={commands.togglePlay} className="flex h-8 w-8 items-center justify-center rounded-full bg-fg text-bg hover:opacity-90">
          {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
        </button>
        <IconButton label="Go to end" onClick={() => seek(duration)}><SkipForward size={15} /></IconButton>
        <span className="ml-2 font-mono text-xs tabular-nums text-muted"><span className="text-fg">{formatTime(playhead, true, fps)}</span> / {formatTime(duration, true, fps)}</span>
      </div>
      <div className="flex w-56 justify-end">
        <IconButton label={maximized ? 'Exit maximized preview (F)' : 'Maximize preview (F)'} onClick={() => useEditor.getState().togglePreviewMaximized()}>
          {maximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </IconButton>
      </div>
    </div>
  );
}

/** Save a library thumbnail once media has had a moment to load. */
function useThumbnail(playerRef: React.RefObject<PreviewPlayer | null>, projectId: string) {
  useEffect(() => {
    const timer = setTimeout(async () => {
      const player = playerRef.current;
      const { project, duration } = useEditor.getState();
      if (!player || !project) return;
      const w = 480;
      const h = Math.round((w * project.canvas.size.height) / project.canvas.size.width);
      const canvas = new OffscreenCanvas(w, h);
      player.snapshot(
        { ctx: canvas.getContext('2d')!, width: w, height: h, createScratch: (sw, sh) => { const c = new OffscreenCanvas(Math.max(1, sw), Math.max(1, sh)); return { canvas: c, ctx: c.getContext('2d')! }; } },
        Math.min(1500, duration / 2),
      );
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      await invoke('project:saveThumbnail', projectId, new Uint8Array(await blob.arrayBuffer())).catch(() => undefined);
    }, 2500);
    return () => clearTimeout(timer);
  }, [playerRef, projectId]);
}
