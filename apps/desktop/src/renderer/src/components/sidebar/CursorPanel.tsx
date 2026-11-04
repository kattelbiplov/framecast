import type { CursorStyle } from '@framecast/schema';
import { useEditor } from '../../stores/editor';
import { ColorInput, Field, Section, Segmented, Select, Slider, Toggle } from '../ui/controls';

export function CursorPanel() {
  const cursor = useEditor((s) => s.project!.cursor);
  const baked = useEditor((s) => [...s.recordings.values()].some((r) => r.cursorBakedIn));
  const apply = useEditor((s) => s.apply);
  const set = (p: Partial<CursorStyle>, label = 'Cursor style') => apply(label, (pr) => ({ ...pr, cursor: { ...pr.cursor, ...p } }), label);
  return (
    <>
      {baked && <p className="m-3 rounded-lg bg-amber-500/10 p-2 text-2xs text-amber-600 dark:text-amber-400">This recording has the system cursor baked in, so only click effects, smoothing-based zoom and spotlight apply. Record with the native engine and “Hide cursor” for a fully restylable cursor.</p>}
      <Section title="Appearance">
        <Field label="Visible"><Toggle label="Show cursor" checked={cursor.visible} onChange={(visible) => set({ visible })} /></Field>
        <Field label="Style"><Select label="Cursor style" value={cursor.style} onChange={(style) => set({ style })} options={[{ value: 'macos', label: 'macOS (black)' }, { value: 'macosWhite', label: 'macOS (white)' }, { value: 'dot', label: 'Dot' }, { value: 'ring', label: 'Ring' }]} /></Field>
        <Field label="Size"><Slider label="Cursor size" min={0.5} max={4} step={0.05} value={cursor.size} onChange={(size) => set({ size }, 'Cursor size')} format={(v) => `${v.toFixed(1)}×`} /></Field>
        {(cursor.style === 'dot' || cursor.style === 'ring' || cursor.style === 'macos') && <Field label="Color"><ColorInput label="Cursor color" value={cursor.color} onChange={(color) => set({ color })} /></Field>}
        <Field label="Shadow"><Toggle label="Cursor shadow" checked={cursor.shadow} onChange={(shadow) => set({ shadow })} /></Field>
        <Field label="Glow"><Toggle label="Cursor glow" checked={cursor.glow} onChange={(glow) => set({ glow })} /></Field>
        <Field label="Highlight"><Toggle label="Cursor highlight halo" checked={cursor.highlight !== null} onChange={(v) => set({ highlight: v ? { color: 'rgba(250,204,21,0.35)', radiusPx: 36 } : null })} /></Field>
        <Field label="Trail"><Toggle label="Motion trail" checked={cursor.trail !== null} onChange={(v) => set({ trail: v ? { lengthMs: 180, color: 'rgba(99,102,241,0.8)' } : null })} /></Field>
        <Field label="Spotlight"><Toggle label="Cursor spotlight" checked={cursor.spotlight} onChange={(spotlight) => set({ spotlight })} /></Field>
      </Section>
      <Section title="Motion">
        <Field label="Smoothing" hint="Spring smoothing of cursor movement. Clicks always land exactly where they happened."><Slider label="Smoothing" min={0} max={1} step={0.01} value={cursor.smoothing} onChange={(smoothing) => set({ smoothing }, 'Cursor smoothing')} format={(v) => `${Math.round(v * 100)}%`} /></Field>
        <Field label="Hide idle"><Toggle label="Hide when idle" checked={cursor.hideWhenIdle} onChange={(hideWhenIdle) => set({ hideWhenIdle })} /></Field>
        {cursor.hideWhenIdle && <Field label="After"><Slider label="Idle timeout" min={500} max={8000} step={100} value={cursor.idleTimeoutMs} onChange={(idleTimeoutMs) => set({ idleTimeoutMs }, 'Idle timeout')} format={(v) => `${(v / 1000).toFixed(1)}s`} /></Field>}
      </Section>
      <Section title="Clicks">
        <Field label="Effect"><Segmented label="Click effect" value={cursor.clickEffect} onChange={(clickEffect) => set({ clickEffect })} options={[{ value: 'none', label: 'None' }, { value: 'ripple', label: 'Ripple' }, { value: 'pulse', label: 'Pulse' }, { value: 'highlight', label: 'Flash' }]} /></Field>
        <Field label="Color"><ColorInput label="Click color" value={cursor.clickColor} onChange={(clickColor) => set({ clickColor })} /></Field>
        <Field label="Press" hint="How much the cursor shrinks while the button is held"><Slider label="Press scale" min={0.5} max={1} step={0.01} value={cursor.clickScale} onChange={(clickScale) => set({ clickScale }, 'Press scale')} format={(v) => `${Math.round(v * 100)}%`} /></Field>
      </Section>
    </>
  );
}
