import { TRANSITION_PRESETS } from '@framecast/animation';
import type { ClipItem, ShapeItem, TextItem, ZoomItem } from '@framecast/schema';
import { insertFreezeFrame, setClipSpeed } from '@framecast/timeline';
import { MousePointerClick, Snowflake } from 'lucide-react';
import { SHAPE_LABELS } from '../../editor/factories';
import { useEditor, useSelectedItem } from '../../stores/editor';
import { Button } from '../ui/Button';
import { ColorInput, Field, NumberInput, Section, Segmented, Select, Slider, Toggle } from '../ui/controls';
import { ProjectInspector } from './ProjectInspector';
import { AnimationEditor, EasingSelect, KeyframesSection, usePatch } from './shared';

export function Inspector() {
  const sel = useSelectedItem();
  return (
    <aside className="flex h-full flex-col border-l border-border bg-panel" aria-label="Inspector">
      <div className="flex h-9 shrink-0 items-center border-b border-border px-3 text-xs font-semibold">
        {sel ? ({ clip: 'Clip', zoom: 'Zoom', text: 'Text', shape: SHAPE_LABELS[(sel.item as ShapeItem).shape] ?? 'Element' } as const)[sel.item.type] : 'Project'}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {!sel && <ProjectInspector />}
        {sel?.item.type === 'clip' && <ClipInspector key={sel.item.id} clip={sel.item} isAudio={sel.track.kind === 'audio'} isOverlay={sel.track.kind === 'video' && sel.track !== useEditor.getState().project?.timeline.tracks.find((t) => t.kind === 'video')} />}
        {sel?.item.type === 'zoom' && <ZoomInspector key={sel.item.id} zoom={sel.item} />}
        {sel?.item.type === 'text' && <TextInspector key={sel.item.id} item={sel.item} />}
        {sel?.item.type === 'shape' && <ShapeInspector key={sel.item.id} item={sel.item} />}
      </div>
    </aside>
  );
}

function ClipInspector({ clip, isAudio, isOverlay }: { clip: ClipItem; isAudio: boolean; isOverlay: boolean }) {
  const patch = usePatch(clip);
  const applyTimeline = useEditor((s) => s.applyTimeline);
  const playhead = useEditor((s) => s.playhead);
  return (
    <>
      <Section title="Playback">
        <Field label="Speed"><Slider label="Speed" min={0.25} max={4} step={0.05} value={clip.speed} onChange={(v) => applyTimeline('Speed', (tl) => setClipSpeed(tl, clip.id, v), `speed-${clip.id}`)} format={(v) => `${v.toFixed(2)}×`} /></Field>
        <Field label="Reverse"><Toggle label="Reverse" checked={clip.reverse} onChange={(reverse) => patch({ reverse }, 'Reverse')} /></Field>
        {!isAudio && (
          <Button size="sm" icon={<Snowflake size={13} />} disabled={playhead <= clip.start || playhead >= clip.start + clip.duration} onClick={() => applyTimeline('Freeze frame', (tl) => insertFreezeFrame(tl, clip.id, playhead, 2000))}>
            Freeze frame at playhead (2s)
          </Button>
        )}
      </Section>
      <Section title="Audio">
        <Field label="Volume"><Slider label="Volume" min={0} max={2} step={0.01} value={clip.volume} onChange={(volume) => patch({ volume }, 'Volume')} format={(v) => `${Math.round(v * 100)}%`} /></Field>
        <Field label="Mute"><Toggle label="Mute clip" checked={clip.muted} onChange={(muted) => patch({ muted }, 'Mute')} /></Field>
        <Field label="Fade in"><Slider label="Fade in" min={0} max={Math.min(5000, clip.duration / 2)} step={50} value={clip.fadeInMs} onChange={(fadeInMs) => patch({ fadeInMs }, 'Fade in')} format={(v) => `${(v / 1000).toFixed(1)}s`} /></Field>
        <Field label="Fade out"><Slider label="Fade out" min={0} max={Math.min(5000, clip.duration / 2)} step={50} value={clip.fadeOutMs} onChange={(fadeOutMs) => patch({ fadeOutMs }, 'Fade out')} format={(v) => `${(v / 1000).toFixed(1)}s`} /></Field>
      </Section>
      {!isAudio && (
        <>
          <Section title="Transition in">
            <Field label="Type">
              <Select label="Transition" value={clip.transitionIn?.presetId ?? ''} options={[{ value: '', label: 'None' }, ...TRANSITION_PRESETS.map((t) => ({ value: t.id, label: t.name }))]}
                onChange={(id) => patch({ transitionIn: id ? { presetId: id, durationMs: TRANSITION_PRESETS.find((t) => t.id === id)!.defaultDurationMs, easing: 'easeInOut' } : null }, 'Transition')} />
            </Field>
            {clip.transitionIn && (
              <Field label="Duration"><Slider label="Transition duration" min={100} max={2000} step={50} value={clip.transitionIn.durationMs} onChange={(durationMs) => patch({ transitionIn: { ...clip.transitionIn!, durationMs } }, 'Transition')} format={(v) => `${(v / 1000).toFixed(2)}s`} /></Field>
            )}
          </Section>
          <Section title="Crop" defaultOpen={false}>
            {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
              <Field key={side} label={side[0]!.toUpperCase() + side.slice(1)}>
                <Slider label={`Crop ${side}`} min={0} max={0.45} step={0.005} value={clip.crop[side]} onChange={(v) => patch({ crop: { ...clip.crop, [side]: v } }, 'Crop')} format={(v) => `${Math.round(v * 100)}%`} />
              </Field>
            ))}
          </Section>
          <Section title="Color" defaultOpen={false}>
            {(['brightness', 'contrast', 'saturation'] as const).map((k) => (
              <Field key={k} label={k[0]!.toUpperCase() + k.slice(1)}>
                <Slider label={k} min={0} max={2} step={0.01} value={clip.color[k]} onChange={(v) => patch({ color: { ...clip.color, [k]: v } }, 'Color')} format={(v) => v.toFixed(2)} />
              </Field>
            ))}
          </Section>
          {isOverlay && <KeyframesSection item={clip} defaults={{ x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 }} onChange={(keyframes) => patch({ keyframes }, 'Keyframes')} />}
        </>
      )}
    </>
  );
}

function ZoomInspector({ zoom }: { zoom: ZoomItem }) {
  const patch = usePatch(zoom);
  return (
    <>
      <Section title="Zoom">
        {zoom.origin === 'auto' && <p className="flex items-center gap-1.5 rounded-md bg-amber-500/10 p-2 text-2xs text-amber-600 dark:text-amber-400"><MousePointerClick size={12} /> Generated from your clicks. Edits make it yours.</p>}
        <Field label="Enabled"><Toggle label="Zoom enabled" checked={!zoom.disabled} onChange={(v) => patch({ disabled: !v }, 'Toggle zoom')} /></Field>
        <Field label="Scale"><Slider label="Zoom scale" min={1.1} max={5} step={0.05} value={zoom.scale} onChange={(scale) => patch({ scale, origin: 'manual' }, 'Zoom scale')} format={(v) => `${v.toFixed(2)}×`} /></Field>
        <Field label="Focus">
          <Segmented label="Zoom focus" value={zoom.focus.mode} onChange={(mode) => patch({ focus: mode === 'fixed' ? { mode, point: { x: 0.5, y: 0.5 } } : { mode }, origin: 'manual' }, 'Zoom focus')} options={[{ value: 'followCursor', label: 'Follow cursor' }, { value: 'fixed', label: 'Fixed point' }]} />
        </Field>
        {zoom.focus.mode === 'fixed' && <FocusPicker x={zoom.focus.point.x} y={zoom.focus.point.y} onChange={(point) => patch({ focus: { mode: 'fixed', point }, origin: 'manual' }, 'Zoom focus')} />}
      </Section>
      <Section title="Motion">
        <Field label="Zoom in"><Slider label="Zoom in duration" min={0} max={3000} step={50} value={zoom.transitionInMs} onChange={(transitionInMs) => patch({ transitionInMs }, 'Zoom timing')} format={(v) => (v === 0 ? 'cut' : `${(v / 1000).toFixed(2)}s`)} /></Field>
        <Field label="Zoom out"><Slider label="Zoom out duration" min={0} max={3000} step={50} value={zoom.transitionOutMs} onChange={(transitionOutMs) => patch({ transitionOutMs }, 'Zoom timing')} format={(v) => (v === 0 ? 'cut' : `${(v / 1000).toFixed(2)}s`)} /></Field>
        <Field label="Hold"><NumberInput label="Zoom duration" min={200} step={100} value={zoom.duration} suffix="ms" onChange={(duration) => patch({ duration }, 'Zoom duration')} /></Field>
        <Field label="Easing"><EasingSelect value={zoom.easing} onChange={(easing) => patch({ easing }, 'Zoom easing')} /></Field>
      </Section>
    </>
  );
}

function FocusPicker({ x, y, onChange }: { x: number; y: number; onChange(p: { x: number; y: number }): void }) {
  const set = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onChange({ x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) });
  };
  return (
    <div role="slider" aria-label="Zoom focus point" aria-valuetext={`${Math.round(x * 100)}%, ${Math.round(y * 100)}%`} tabIndex={0}
      className="relative aspect-video w-full cursor-crosshair rounded-md border border-border bg-raised"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(e); }}
      onPointerMove={(e) => e.buttons === 1 && set(e)}
    >
      <div className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} />
    </div>
  );
}

const FONTS = ['Inter', 'JetBrains Mono', 'Georgia', 'Helvetica Neue', 'Arial Black', 'Courier New'].map((f) => ({ value: f, label: f }));

function TextInspector({ item }: { item: TextItem }) {
  const patch = usePatch(item);
  const s = item.style;
  const style = (p: Partial<TextItem['style']>) => patch({ style: { ...s, ...p } }, 'Text style');
  const transform = (p: Partial<TextItem['transform']>) => patch({ transform: { ...item.transform, ...p } }, 'Transform');
  return (
    <>
      <Section title="Content">
        <textarea aria-label="Text content" value={item.text} onChange={(e) => patch({ text: e.target.value }, 'Edit text')} rows={3} className="w-full resize-y rounded-md border border-border bg-raised p-2 text-xs" />
      </Section>
      <Section title="Typography">
        <Field label="Font"><Select label="Font family" value={s.fontFamily} options={FONTS} onChange={(fontFamily) => style({ fontFamily })} /></Field>
        <Field label="Size"><Slider label="Font size" min={12} max={240} step={1} value={s.fontSizePx} onChange={(fontSizePx) => style({ fontSizePx })} format={(v) => `${v}px`} /></Field>
        <Field label="Weight"><Slider label="Font weight" min={100} max={900} step={100} value={s.fontWeight} onChange={(fontWeight) => style({ fontWeight })} format={(v) => String(v)} /></Field>
        <Field label="Color"><ColorInput label="Text color" value={s.color} onChange={(color) => style({ color })} /></Field>
        <Field label="Align"><Segmented label="Alignment" value={s.align} onChange={(align) => style({ align })} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} /></Field>
        <Field label="Letter sp."><Slider label="Letter spacing" min={-6} max={20} step={0.5} value={s.letterSpacingPx} onChange={(letterSpacingPx) => style({ letterSpacingPx })} format={(v) => `${v}px`} /></Field>
        <Field label="Line height"><Slider label="Line height" min={0.8} max={2.4} step={0.05} value={s.lineHeight} onChange={(lineHeight) => style({ lineHeight })} format={(v) => v.toFixed(2)} /></Field>
        <Field label="Background"><div className="flex items-center gap-2"><Toggle label="Text background" checked={s.background !== null} onChange={(v) => style({ background: v ? 'rgba(17,17,27,0.8)' : null })} />{s.background && <ColorInput label="Background color" value={s.background} onChange={(background) => style({ background })} />}</div></Field>
        <Field label="Outline"><div className="flex items-center gap-2"><Toggle label="Text outline" checked={s.stroke !== null} onChange={(v) => style({ stroke: v ? { color: '#000000', widthPx: 6 } : null })} />{s.stroke && <ColorInput label="Outline color" value={s.stroke.color} onChange={(color) => style({ stroke: { ...s.stroke!, color } })} />}</div></Field>
        <Field label="Shadow"><Toggle label="Text shadow" checked={s.shadow !== null} onChange={(v) => style({ shadow: v ? { color: 'rgba(0,0,0,0.5)', blurPx: 16, offsetX: 0, offsetY: 6 } : null })} /></Field>
      </Section>
      <Section title="Transform">
        <Field label="X"><Slider label="Position X" min={0} max={1} step={0.005} value={item.transform.x} onChange={(x) => transform({ x })} format={(v) => `${Math.round(v * 100)}%`} /></Field>
        <Field label="Y"><Slider label="Position Y" min={0} max={1} step={0.005} value={item.transform.y} onChange={(y) => transform({ y })} format={(v) => `${Math.round(v * 100)}%`} /></Field>
        <Field label="Scale"><Slider label="Scale" min={0.2} max={4} step={0.01} value={item.transform.scale} onChange={(scale) => transform({ scale })} format={(v) => `${v.toFixed(2)}×`} /></Field>
        <Field label="Rotation"><Slider label="Rotation" min={-180} max={180} step={1} value={item.transform.rotation} onChange={(rotation) => transform({ rotation })} format={(v) => `${v}°`} /></Field>
        <Field label="Opacity"><Slider label="Opacity" min={0} max={1} step={0.01} value={item.transform.opacity} onChange={(opacity) => transform({ opacity })} format={(v) => `${Math.round(v * 100)}%`} /></Field>
      </Section>
      <Section title="Animation">
        <AnimationEditor title="In" value={item.animationIn} onChange={(animationIn) => patch({ animationIn }, 'Animation in')} />
        <AnimationEditor title="Out" value={item.animationOut} onChange={(animationOut) => patch({ animationOut }, 'Animation out')} />
      </Section>
      <KeyframesSection item={item} defaults={{ x: item.transform.x, y: item.transform.y, scale: item.transform.scale, rotation: item.transform.rotation, opacity: item.transform.opacity }} onChange={(keyframes) => patch({ keyframes }, 'Keyframes')} />
    </>
  );
}

function ShapeInspector({ item }: { item: ShapeItem }) {
  const patch = usePatch(item);
  const privacy = item.shape === 'blur' || item.shape === 'pixelate';
  return (
    <>
      <Section title="Appearance">
        {!privacy && <Field label="Stroke"><ColorInput label="Stroke color" value={item.stroke} onChange={(stroke) => patch({ stroke }, 'Stroke')} /></Field>}
        {!privacy && <Field label="Width"><Slider label="Stroke width" min={0} max={30} step={1} value={item.strokeWidthPx} onChange={(strokeWidthPx) => patch({ strokeWidthPx }, 'Stroke width')} format={(v) => `${v}px`} /></Field>}
        {!privacy && <Field label="Fill"><div className="flex items-center gap-2"><Toggle label="Fill" checked={item.fill !== null} onChange={(v) => patch({ fill: v ? 'rgba(99,102,241,0.25)' : null }, 'Fill')} />{item.fill && <ColorInput label="Fill color" value={item.fill} onChange={(fill) => patch({ fill }, 'Fill')} />}</div></Field>}
        <Field label="Radius"><Slider label="Corner radius" min={0} max={60} step={1} value={item.cornerRadiusPx} onChange={(cornerRadiusPx) => patch({ cornerRadiusPx }, 'Radius')} format={(v) => `${v}px`} /></Field>
        {privacy && <Field label={item.shape === 'blur' ? 'Blur' : 'Block size'}><Slider label="Amount" min={2} max={60} step={1} value={item.amount} onChange={(amount) => patch({ amount }, 'Amount')} format={(v) => `${v}px`} /></Field>}
        {item.shape === 'step' && <Field label="Number"><NumberInput label="Step number" min={1} max={99} value={item.amount} onChange={(amount) => patch({ amount }, 'Step')} /></Field>}
        {(item.shape === 'callout' || item.shape === 'step') && <Field label="Label"><input aria-label="Label" value={item.label} onChange={(e) => patch({ label: e.target.value }, 'Label')} className="h-7 w-full rounded-md border border-border bg-raised px-2 text-xs" /></Field>}
        {privacy && <p className="text-2xs text-muted">Privacy regions hide what is underneath in the preview and export. Check them carefully — detection is never automatic.</p>}
      </Section>
      <Section title="Geometry">
        {(['from', 'to'] as const).map((k) => (
          <Field key={k} label={k === 'from' ? 'Start' : 'End'}>
            <div className="grid grid-cols-2 gap-1">
              <NumberInput label={`${k} x`} step={0.01} value={item[k].x} onChange={(x) => patch({ [k]: { ...item[k], x } }, 'Geometry')} />
              <NumberInput label={`${k} y`} step={0.01} value={item[k].y} onChange={(y) => patch({ [k]: { ...item[k], y } }, 'Geometry')} />
            </div>
          </Field>
        ))}
        <p className="text-2xs text-muted">Tip: drag the element directly on the preview.</p>
      </Section>
      {!privacy && (
        <Section title="Animation">
          <AnimationEditor title="In" value={item.animationIn} onChange={(animationIn) => patch({ animationIn }, 'Animation in')} />
          <AnimationEditor title="Out" value={item.animationOut} onChange={(animationOut) => patch({ animationOut }, 'Animation out')} />
        </Section>
      )}
      <KeyframesSection item={item} defaults={{ x: 0, y: 0, opacity: 1 }} onChange={(keyframes) => patch({ keyframes }, 'Keyframes')} />
    </>
  );
}
