import { ANIMATION_PRESETS, TRANSITION_PRESETS, ease, evaluateTransition, unitProgress, type AnimationPreset } from '@framecast/animation';
import clsx from 'clsx';
import { Search, Star } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { applyAnimationToItem, ANIMATION_DRAG_TYPE } from '../../editor/animation-dnd';
import { useEditor, useSelectedItem } from '../../stores/editor';
import { Button } from '../ui/Button';

type Category = 'all' | 'favorites' | 'basic' | 'text' | 'emphasis' | 'graphic' | 'transitions';

const FAV_KEY = 'framecast:favorite-animations';
function loadFavorites(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function AnimationsPanel() {
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState(loadFavorites);
  const sel = useSelectedItem();

  const toggleFav = (id: string) => {
    const next = new Set(favorites);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFavorites(next);
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  };

  const q = query.trim().toLowerCase();
  const presets = useMemo(() => ANIMATION_PRESETS.filter((p) =>
    (category === 'all' || (category === 'favorites' ? favorites.has(p.id) : p.category === category)) && (!q || p.name.toLowerCase().includes(q))), [category, favorites, q]);
  const transitions = useMemo(() => TRANSITION_PRESETS.filter((t) =>
    (category === 'all' || category === 'transitions' || (category === 'favorites' && favorites.has(`t:${t.id}`))) && (!q || t.name.toLowerCase().includes(q))), [category, favorites, q]);

  const target = sel && (sel.item.type === 'text' || sel.item.type === 'shape' || sel.item.type === 'graphic') ? sel.item : null;
  const clipTarget = sel?.item.type === 'clip' ? sel.item : null;

  return (
    <div className="space-y-3 p-3">
      <div className="relative">
        <Search size={13} className="absolute left-2 top-2 text-muted" />
        <input aria-label="Search animations" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search animations" className="h-7 w-full rounded-md border border-border bg-raised pl-7 pr-2 text-xs" />
      </div>
      <div className="flex flex-wrap gap-1">
        {(['all', 'favorites', 'basic', 'text', 'emphasis', 'graphic', 'transitions'] as Category[]).map((c) => (
          <button key={c} type="button" onClick={() => setCategory(c)} className={clsx('rounded-full px-2 py-0.5 text-2xs capitalize', category === c ? 'bg-accent text-white' : 'bg-raised text-muted hover:text-fg')}>{c}</button>
        ))}
      </div>
      <p className="text-2xs text-muted">
        {target ? 'Click In/Out to apply to the selected element, or drag onto any timeline item.' : clipTarget ? 'Click a transition to apply it to the selected clip.' : 'Select a text or element, or drag a preset onto a timeline item.'}
      </p>

      {presets.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {presets.map((p) => (
            <PresetTile key={p.id} preset={p} favorite={favorites.has(p.id)} onFavorite={() => toggleFav(p.id)}>
              {target && (
                <div className="flex gap-1">
                  <Button size="sm" className="h-6 flex-1 px-1" onClick={() => applyAnimationToItem(target.id, p.id, 'in')}>In</Button>
                  <Button size="sm" className="h-6 flex-1 px-1" onClick={() => applyAnimationToItem(target.id, p.id, 'out')}>Out</Button>
                </div>
              )}
            </PresetTile>
          ))}
        </div>
      )}

      {transitions.length > 0 && (
        <>
          <p className="pt-2 text-2xs font-semibold uppercase tracking-wide text-muted">Transitions</p>
          <div className="grid grid-cols-2 gap-2">
            {transitions.map((t) => (
              <TransitionTile key={t.id} id={t.id} name={t.name} favorite={favorites.has(`t:${t.id}`)} onFavorite={() => toggleFav(`t:${t.id}`)}
                onApply={clipTarget ? () => useEditor.getState().applyTimeline('Transition', (tl) => ({
                  ...tl, tracks: tl.tracks.map((tr) => ({ ...tr, items: tr.items.map((i) => (i.id === clipTarget.id && i.type === 'clip' ? { ...i, transitionIn: { presetId: t.id, durationMs: t.defaultDurationMs, easing: t.defaultEasing } } : i)) })),
                })) : undefined} />
            ))}
          </div>
        </>
      )}
      {presets.length === 0 && transitions.length === 0 && <p className="py-6 text-center text-xs text-muted">No presets match.</p>}
    </div>
  );
}

/** Animated preview that loops while hovered. */
function usePreviewLoop(draw: (ctx: CanvasRenderingContext2D, p: number, w: number, h: number) => void, durationMs: number) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (!hover) {
      draw(ctx, 1, w, h);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const cycle = durationMs + 700;
      draw(ctx, Math.min(1, ((now - start) % cycle) / durationMs), w, h);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hover, draw, durationMs]);
  return { ref, onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false) };
}

function PresetTile({ preset, favorite, onFavorite, children }: { preset: AnimationPreset; favorite: boolean; onFavorite(): void; children?: React.ReactNode }) {
  const draw = useMemo(() => (ctx: CanvasRenderingContext2D, raw: number, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    const p = ease(preset.defaultEasing, raw);
    const pose = { dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1, blurPx: 0, reveal: 1, revealUnit: 'none' as const, perUnit: null, ...preset.pose(p, { direction: 'up', params: {} }) };
    ctx.save();
    ctx.translate(w / 2 + pose.dx * w, h / 2 + pose.dy * h);
    ctx.rotate((pose.rotation * Math.PI) / 180);
    ctx.scale(pose.scale, pose.scale);
    ctx.globalAlpha = Math.max(0, Math.min(1, pose.opacity));
    if (pose.blurPx > 0.1) ctx.filter = `blur(${pose.blurPx / 4}px)`;
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 22px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (preset.category === 'graphic') {
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-30, 10);
      ctx.lineTo(-30 + 60 * pose.reveal, 10 - 20 * pose.reveal);
      ctx.stroke();
    } else if (pose.revealUnit !== 'none' || pose.perUnit) {
      const units = pose.revealUnit === 'char' ? [...'Hello'] : ['Hi', 'there'];
      const widths = units.map((u) => ctx.measureText(pose.revealUnit === 'char' ? u : `${u} `).width);
      let x = -widths.reduce((a, b) => a + b, 0) / 2;
      units.forEach((u, i) => {
        const up = unitProgress(pose.reveal, i, units.length, pose.perUnit ? 0.6 : 0);
        if (up > 0) {
          const d = pose.perUnit?.(up) ?? {};
          ctx.save();
          ctx.globalAlpha *= d.opacity ?? 1;
          ctx.translate(x + widths[i]! / 2 + (d.dx ?? 0) * w, (d.dy ?? 0) * h);
          ctx.scale(d.scale ?? 1, d.scale ?? 1);
          ctx.fillText(u, 0, 0);
          ctx.restore();
        }
        x += widths[i]!;
      });
    } else ctx.fillText('Aa', 0, 0);
    ctx.restore();
  }, [preset]);
  const loop = usePreviewLoop(draw, preset.defaultDurationMs);
  return (
    <div draggable onDragStart={(e) => e.dataTransfer.setData(ANIMATION_DRAG_TYPE, preset.id)} className="group rounded-lg border border-border bg-panel p-1.5 transition hover:border-accent/60">
      <div className="relative">
        <canvas {...loop} className="aspect-video w-full rounded-md bg-gradient-to-br from-indigo-600 to-fuchsia-600" />
        <button type="button" aria-label={favorite ? 'Remove favorite' : 'Add favorite'} onClick={onFavorite} className={clsx('absolute right-1 top-1 rounded p-0.5', favorite ? 'text-amber-300' : 'text-white/60 opacity-0 group-hover:opacity-100')}>
          <Star size={12} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      </div>
      <p className="my-1 truncate text-2xs font-medium">{preset.name}</p>
      {children}
    </div>
  );
}

function TransitionTile({ id, name, favorite, onFavorite, onApply }: { id: string; name: string; favorite: boolean; onFavorite(): void; onApply?: () => void }) {
  const draw = useMemo(() => (ctx: CanvasRenderingContext2D, p: number, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    const fx = evaluateTransition(id, p);
    const layer = (color: string, e: typeof fx.incoming) => {
      ctx.save();
      ctx.globalAlpha = e.opacity;
      ctx.translate(w / 2 + e.dx * w, h / 2 + e.dy * h);
      ctx.rotate((e.rotation * Math.PI) / 180);
      ctx.scale(e.scale, e.scale);
      if (e.blurPx > 0.1) ctx.filter = `blur(${e.blurPx / 6}px)`;
      if (e.wipe < 1) {
        ctx.beginPath();
        ctx.rect(-w / 2, -h / 2, w * e.wipe, h);
        ctx.clip();
      }
      ctx.fillStyle = color;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    };
    layer('#0ea5e9', fx.outgoing);
    layer('#f97316', fx.incoming);
  }, [id]);
  const loop = usePreviewLoop(draw, 700);
  return (
    <div className="group rounded-lg border border-border bg-panel p-1.5 transition hover:border-accent/60">
      <div className="relative overflow-hidden rounded-md">
        <canvas {...loop} className="aspect-video w-full bg-black" />
        <button type="button" aria-label={favorite ? 'Remove favorite' : 'Add favorite'} onClick={onFavorite} className={clsx('absolute right-1 top-1 rounded p-0.5', favorite ? 'text-amber-300' : 'text-white/60 opacity-0 group-hover:opacity-100')}>
          <Star size={12} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <p className="truncate text-2xs font-medium">{name}</p>
        {onApply && <Button size="sm" className="h-5 px-1.5 text-2xs" onClick={onApply}>Apply</Button>}
      </div>
    </div>
  );
}
