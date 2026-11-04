import type { Background } from '@framecast/schema';
import clsx from 'clsx';
import { useMemo } from 'react';
import { useEditor } from '../../stores/editor';
import { ColorInput, Field, Section, Segmented, Select, Slider } from '../ui/controls';

const GRADIENTS: [string, string][] = [
  ['#4f46e5', '#db2777'], ['#0ea5e9', '#6366f1'], ['#f97316', '#e11d48'], ['#10b981', '#0ea5e9'], ['#1e1b4b', '#7c3aed'],
  ['#fde68a', '#f472b6'], ['#111827', '#374151'], ['#a7f3d0', '#93c5fd'], ['#0f172a', '#0e7490'], ['#fbcfe8', '#c4b5fd'],
];
const SOLIDS = ['#0b0b0f', '#ffffff', '#f4f4f5', '#1f2937', '#6366f1', '#ef4444', '#f59e0b', '#10b981'];

export function BackgroundPanel() {
  const bg = useEditor((s) => s.project!.canvas.background);
  const assets = useEditor((s) => s.project!.assets);
  const images = useMemo(() => assets.filter((a) => a.role === 'image' || a.role === 'video'), [assets]);
  const apply = useEditor((s) => s.apply);
  const set = (background: Background, key = 'Background') => apply('Background', (p) => ({ ...p, canvas: { ...p.canvas, background } }), key);

  return (
    <>
      <Section title="Type">
        <Segmented label="Background type" value={bg.type} onChange={(type) => {
          if (type === 'solid') set({ type, color: '#0b0b0f' });
          else if (type === 'gradient') set({ type, stops: [{ offset: 0, color: '#4f46e5' }, { offset: 1, color: '#db2777' }], angleDeg: 135, animateDegPerSec: 0 });
          else if (type === 'pattern') set({ type, pattern: 'dots', color: 'rgba(255,255,255,0.15)', background: '#111827', spacingPx: 28 });
          else if (images[0]) set({ type: images[0].role === 'video' ? 'video' : 'image', assetId: images[0].id, blurPx: 24 });
        }} options={[{ value: 'gradient', label: 'Gradient' }, { value: 'solid', label: 'Solid' }, { value: 'pattern', label: 'Pattern' }, { value: 'image', label: 'Media', title: images.length ? undefined : 'Import an image or video first' }]} />
      </Section>
      {bg.type === 'gradient' && (
        <Section title="Gradient">
          <div className="grid grid-cols-5 gap-1.5">
            {GRADIENTS.map(([a, b]) => (
              <button key={a + b} type="button" aria-label={`Gradient ${a} to ${b}`} onClick={() => set({ ...bg, stops: [{ offset: 0, color: a }, { offset: 1, color: b }] })}
                className={clsx('aspect-square rounded-lg ring-offset-2 ring-offset-panel', bg.stops[0]?.color === a && bg.stops[1]?.color === b && 'ring-2 ring-accent')}
                style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} />
            ))}
          </div>
          <Field label="From"><ColorInput label="Gradient start" value={bg.stops[0]?.color ?? '#000000'} onChange={(c) => set({ ...bg, stops: [{ offset: 0, color: c }, ...bg.stops.slice(1)] }, 'grad-from')} /></Field>
          <Field label="To"><ColorInput label="Gradient end" value={bg.stops.at(-1)?.color ?? '#000000'} onChange={(c) => set({ ...bg, stops: [...bg.stops.slice(0, -1), { offset: 1, color: c }] }, 'grad-to')} /></Field>
          <Field label="Angle"><Slider label="Gradient angle" min={0} max={360} step={1} value={bg.angleDeg} onChange={(angleDeg) => set({ ...bg, angleDeg }, 'grad-angle')} format={(v) => `${v}°`} /></Field>
          <Field label="Animate"><Slider label="Gradient rotation speed" min={0} max={60} step={1} value={bg.animateDegPerSec} onChange={(animateDegPerSec) => set({ ...bg, animateDegPerSec }, 'grad-anim')} format={(v) => (v ? `${v}°/s` : 'off')} /></Field>
        </Section>
      )}
      {bg.type === 'solid' && (
        <Section title="Color">
          <div className="grid grid-cols-8 gap-1.5">
            {SOLIDS.map((c) => <button key={c} type="button" aria-label={c} onClick={() => set({ type: 'solid', color: c })} className={clsx('aspect-square rounded-md border border-border', bg.color === c && 'ring-2 ring-accent')} style={{ background: c }} />)}
          </div>
          <Field label="Custom"><ColorInput label="Background color" value={bg.color} onChange={(color) => set({ type: 'solid', color }, 'solid')} /></Field>
        </Section>
      )}
      {bg.type === 'pattern' && (
        <Section title="Pattern">
          <Field label="Pattern"><Segmented label="Pattern" value={bg.pattern} onChange={(pattern) => set({ ...bg, pattern })} options={[{ value: 'dots', label: 'Dots' }, { value: 'grid', label: 'Grid' }, { value: 'diagonal', label: 'Lines' }]} /></Field>
          <Field label="Ink"><ColorInput label="Pattern color" value={bg.color} onChange={(color) => set({ ...bg, color }, 'pat-c')} /></Field>
          <Field label="Base"><ColorInput label="Pattern background" value={bg.background} onChange={(background) => set({ ...bg, background }, 'pat-b')} /></Field>
          <Field label="Spacing"><Slider label="Pattern spacing" min={8} max={80} step={1} value={bg.spacingPx} onChange={(spacingPx) => set({ ...bg, spacingPx }, 'pat-s')} format={(v) => `${v}px`} /></Field>
        </Section>
      )}
      {(bg.type === 'image' || bg.type === 'video') && (
        <Section title="Media">
          <Field label="Asset"><Select label="Background media" value={bg.assetId} options={images.map((a) => ({ value: a.id, label: a.name }))} onChange={(assetId) => set({ type: images.find((a) => a.id === assetId)?.role === 'video' ? 'video' : 'image', assetId, blurPx: bg.blurPx })} /></Field>
          <Field label="Blur"><Slider label="Background blur" min={0} max={80} step={1} value={bg.blurPx} onChange={(blurPx) => set({ ...bg, blurPx }, 'bg-blur')} format={(v) => `${v}px`} /></Field>
        </Section>
      )}
    </>
  );
}
