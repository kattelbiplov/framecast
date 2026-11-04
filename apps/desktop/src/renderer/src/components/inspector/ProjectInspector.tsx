import type { DeviceMockup, FrameStyle, WebcamStyle } from '@framecast/schema';
import { useEditor } from '../../stores/editor';
import { ColorInput, Field, Section, Segmented, Select, Slider, Toggle } from '../ui/controls';

const MOCKUPS: { value: DeviceMockup; label: string }[] = [
  { value: 'none', label: 'None' }, { value: 'browser', label: 'Browser window' }, { value: 'macbook', label: 'MacBook' },
  { value: 'monitor', label: 'Desktop monitor' }, { value: 'tablet', label: 'Tablet' }, { value: 'phone', label: 'Smartphone' },
];

export function ProjectInspector() {
  const project = useEditor((s) => s.project)!;
  const apply = useEditor((s) => s.apply);
  const f = project.frame;
  const w = project.webcam;
  const frame = (p: Partial<FrameStyle>, label = 'Frame style') => apply(label, (pr) => ({ ...pr, frame: { ...pr.frame, ...p } }), label);
  const webcam = (p: Partial<WebcamStyle>, label = 'Webcam style') => apply(label, (pr) => ({ ...pr, webcam: { ...pr.webcam, ...p } }), label);
  const hasWebcam = project.assets.some((a) => a.role === 'webcam');
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <>
      <Section title="Canvas">
        <p className="text-2xs text-muted">{project.canvas.size.width} × {project.canvas.size.height} · {project.canvas.fps} fps</p>
        <Field label="Reframe" hint="When the canvas is narrower than the recording, follow the cursor instead of letterboxing">
          <Segmented label="Vertical reframing" value={project.canvas.reframeFocus} onChange={(reframeFocus) => apply('Reframing', (p) => ({ ...p, canvas: { ...p.canvas, reframeFocus } }))} options={[{ value: 'cursor', label: 'Follow cursor' }, { value: 'center', label: 'Center' }]} />
        </Field>
      </Section>
      <Section title="Frame">
        <Field label="Padding"><Slider label="Padding" min={0} max={0.25} step={0.005} value={f.padding} onChange={(padding) => frame({ padding })} format={pct} /></Field>
        <Field label="Scale"><Slider label="Screen scale" min={0.5} max={1.5} step={0.01} value={f.scale} onChange={(scale) => frame({ scale })} format={pct} /></Field>
        <Field label="Corners"><Slider label="Corner radius" min={0} max={60} step={1} value={f.cornerRadiusPx} onChange={(cornerRadiusPx) => frame({ cornerRadiusPx })} format={(v) => `${v}px`} /></Field>
        <Field label="Shadow"><Toggle label="Drop shadow" checked={f.shadow !== null} onChange={(v) => frame({ shadow: v ? { color: 'rgba(0,0,0,0.45)', blurPx: 40, offsetX: 0, offsetY: 16 } : null })} /></Field>
        {f.shadow && <Field label="Shadow blur"><Slider label="Shadow blur" min={0} max={120} step={1} value={f.shadow.blurPx} onChange={(blurPx) => frame({ shadow: { ...f.shadow!, blurPx } })} format={(v) => `${v}px`} /></Field>}
        <Field label="Border"><div className="flex items-center gap-2"><Toggle label="Border" checked={f.border !== null} onChange={(v) => frame({ border: v ? { widthPx: 2, color: 'rgba(255,255,255,0.6)' } : null })} />{f.border && <ColorInput label="Border color" value={f.border.color} onChange={(color) => frame({ border: { ...f.border!, color } })} />}</div></Field>
        <Field label="Rotation"><Slider label="Rotation" min={-15} max={15} step={0.5} value={f.rotationDeg} onChange={(rotationDeg) => frame({ rotationDeg })} format={(v) => `${v}°`} /></Field>
        <Field label="Tilt X"><Slider label="Perspective tilt X" min={-20} max={20} step={0.5} value={f.tiltXDeg} onChange={(tiltXDeg) => frame({ tiltXDeg })} format={(v) => `${v}°`} /></Field>
        <Field label="Tilt Y"><Slider label="Perspective tilt Y" min={-20} max={20} step={0.5} value={f.tiltYDeg} onChange={(tiltYDeg) => frame({ tiltYDeg })} format={(v) => `${v}°`} /></Field>
        <Field label="Mockup"><Select label="Device mockup" value={f.mockup} options={MOCKUPS} onChange={(mockup) => frame({ mockup })} /></Field>
      </Section>
      <Section title="Webcam" defaultOpen={hasWebcam}>
        {!hasWebcam && <p className="text-2xs text-muted">Enable the camera in Recording Setup to add a presenter overlay.</p>}
        <Field label="Visible"><Toggle label="Show webcam" checked={w.visible} onChange={(visible) => webcam({ visible })} /></Field>
        <Field label="Shape"><Segmented label="Webcam shape" value={w.shape} onChange={(shape) => webcam({ shape })} options={[{ value: 'circle', label: 'Circle' }, { value: 'rounded', label: 'Rounded' }, { value: 'square', label: 'Square' }]} /></Field>
        <Field label="Size"><Slider label="Webcam size" min={0.08} max={0.5} step={0.005} value={w.size} onChange={(size) => webcam({ size })} format={pct} /></Field>
        <Field label="Position">
          <Select label="Webcam position" value={cornerOf(w.position)} onChange={(c) => webcam({ position: CORNERS[c] })} options={[
            { value: 'br', label: 'Bottom right' }, { value: 'bl', label: 'Bottom left' }, { value: 'tr', label: 'Top right' }, { value: 'tl', label: 'Top left' }, { value: 'custom', label: 'Custom' },
          ]} />
        </Field>
        <Field label="Mirror"><Toggle label="Mirror webcam" checked={w.mirror} onChange={(mirror) => webcam({ mirror })} /></Field>
        <Field label="Shrink on zoom"><Toggle label="Shrink webcam during zoom" checked={w.shrinkOnZoom} onChange={(shrinkOnZoom) => webcam({ shrinkOnZoom })} /></Field>
        <Field label="Border"><div className="flex items-center gap-2"><Toggle label="Webcam border" checked={w.border !== null} onChange={(v) => webcam({ border: v ? { widthPx: 4, color: '#ffffff' } : null })} />{w.border && <ColorInput label="Webcam border color" value={w.border.color} onChange={(color) => webcam({ border: { ...w.border!, color } })} />}</div></Field>
      </Section>
      <Section title="Audio" defaultOpen={false}>
        <Field label="Normalize" hint="EBU R128 loudness normalization on export (-16 LUFS)"><Toggle label="Normalize audio" checked={project.audio.normalize} onChange={(normalize) => apply('Audio', (p) => ({ ...p, audio: { ...p.audio, normalize } }))} /></Field>
        <Field label="Denoise" hint="FFT noise reduction on the microphone track during export"><Toggle label="Noise reduction" checked={project.audio.noiseReduction} onChange={(noiseReduction) => apply('Audio', (p) => ({ ...p, audio: { ...p.audio, noiseReduction } }))} /></Field>
        <Field label="Ducking" hint="Lower music while you speak (export)"><Slider label="Music ducking" min={0} max={24} step={1} value={project.audio.duckingDb} onChange={(duckingDb) => apply('Audio', (p) => ({ ...p, audio: { ...p.audio, duckingDb } }), 'ducking')} format={(v) => (v === 0 ? 'off' : `-${v}dB`)} /></Field>
      </Section>
    </>
  );
}

const CORNERS = { br: { x: 0.88, y: 0.82 }, bl: { x: 0.12, y: 0.82 }, tr: { x: 0.88, y: 0.18 }, tl: { x: 0.12, y: 0.18 }, custom: { x: 0.5, y: 0.5 } } as const;
type Corner = keyof typeof CORNERS;
function cornerOf(p: { x: number; y: number }): Corner {
  return (Object.keys(CORNERS) as Corner[]).find((k) => k !== 'custom' && Math.abs(CORNERS[k].x - p.x) < 0.01 && Math.abs(CORNERS[k].y - p.y) < 0.01) ?? 'custom';
}
