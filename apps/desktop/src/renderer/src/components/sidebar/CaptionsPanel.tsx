import { newId, SubtitleTrack, type SubtitleCue, type CaptionStyle } from '@framecast/schema';
import { CAPTION_PRESETS, applyCaptionPreset, editCueText, mergeCues, shiftCues, splitCue } from '@framecast/subtitles';
import clsx from 'clsx';
import { Download, FileUp, Loader2, Merge, Mic, Plus, Scissors, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TranscriptionAvailability } from '../../../../shared/ipc';
import { errorMessage, formatTime } from '../../lib/format';
import { invoke } from '../../lib/ipc';
import { toast } from '../../stores/app';
import { useEditor } from '../../stores/editor';
import { Button, IconButton } from '../ui/Button';
import { ColorInput, Field, Section, Segmented, Select, Slider, Toggle } from '../ui/controls';

const LANGUAGES = [
  { value: 'auto', label: 'Auto-detect' }, { value: 'en', label: 'English' }, { value: 'es', label: 'Spanish' }, { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' }, { value: 'pt', label: 'Portuguese' }, { value: 'it', label: 'Italian' }, { value: 'ja', label: 'Japanese' },
  { value: 'zh', label: 'Chinese' }, { value: 'hi', label: 'Hindi' }, { value: 'ne', label: 'Nepali' },
];

export function CaptionsPanel() {
  const project = useEditor((s) => s.project)!;
  const apply = useEditor((s) => s.apply);
  const selectedCueId = useEditor((s) => s.selectedCueId);
  const [availability, setAvailability] = useState<TranscriptionAvailability | null>(null);
  const [language, setLanguage] = useState('auto');
  const [busy, setBusy] = useState(false);
  const track = project.subtitles[0];
  const voiceAsset = project.assets.find((a) => a.role === 'microphone') ?? project.assets.find((a) => a.hasAudio);

  useEffect(() => void invoke('transcription:availability').then(setAvailability), []);

  const setTrack = (fn: (t: SubtitleTrack) => SubtitleTrack, label: string, key?: string) =>
    apply(label, (p) => ({ ...p, subtitles: p.subtitles.length ? [fn(p.subtitles[0]!), ...p.subtitles.slice(1)] : [fn(SubtitleTrack.parse({ id: newId('sub') }))] }), key);
  const setCues = (cues: SubtitleCue[], label: string, key?: string) => setTrack((t) => ({ ...t, cues: [...cues].sort((a, b) => a.start - b.start) }), label, key);
  const setStyle = (patch: Partial<CaptionStyle>, label = 'Caption style') => setTrack((t) => ({ ...t, style: { ...t.style, ...patch } }), label, label);

  const transcribe = async () => {
    if (!voiceAsset) return;
    setBusy(true);
    try {
      const cues = await invoke('transcription:run', project.id, voiceAsset.id, language);
      // Cues are in source time; offset by where the audio clip sits on the timeline.
      const clip = project.timeline.tracks.flatMap((t) => t.items).find((i) => i.type === 'clip' && i.assetId === voiceAsset.id);
      const offset = clip && clip.type === 'clip' ? clip.start - clip.sourceIn : 0;
      setTrack((t) => ({ ...t, source: 'transcription', language, cues: shiftCues(cues, offset) }), 'Generate subtitles');
      toast('success', `Generated ${cues.length} captions`);
    } catch (e) {
      toast('error', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const importFile = async () => {
    const r = await invoke('subtitles:import').catch((e) => void toast('error', errorMessage(e)));
    if (r) setTrack((t) => ({ ...t, source: 'import', label: r.name, cues: r.cues }), 'Import subtitles');
  };

  const addCue = () => {
    const t = useEditor.getState().playhead;
    setCues([...(track?.cues ?? []), { id: newId('cue'), start: t, end: t + 2000, text: 'New caption', words: [] }], 'Add caption');
  };

  return (
    <>
      <Section title="Generate">
        {availability && !availability.available && <p className="rounded-md bg-raised p-2 text-2xs text-muted">{availability.reason}</p>}
        <Field label="Language"><Select label="Transcription language" value={language} options={LANGUAGES} onChange={setLanguage} /></Field>
        <Button variant="primary" className="w-full" disabled={!availability?.available || !voiceAsset || busy} icon={busy ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />} onClick={() => void transcribe()}>
          {busy ? 'Transcribing on device…' : track?.cues.length ? 'Regenerate from audio' : 'Generate from audio'}
        </Button>
        <div className="flex gap-1.5">
          <Button size="sm" className="flex-1" icon={<FileUp size={13} />} onClick={() => void importFile()}>Import</Button>
          <Button size="sm" className="flex-1" icon={<Download size={13} />} title="Export SRT" disabled={!track?.cues.length} onClick={() => void invoke('subtitles:export', track!.cues, 'srt', project.name)}>SRT</Button>
          <Button size="sm" className="flex-1" icon={<Download size={13} />} title="Export WebVTT" disabled={!track?.cues.length} onClick={() => void invoke('subtitles:export', track!.cues, 'vtt', project.name)}>VTT</Button>
        </div>
      </Section>

      <Section title="Style">
        <div className="grid grid-cols-2 gap-1.5">
          {CAPTION_PRESETS.map((p) => (
            <button key={p.id} type="button" title={p.description} onClick={() => setTrack((t) => ({ ...t, style: applyCaptionPreset(t.style, p.id) }), 'Caption preset')}
              className={clsx('rounded-lg border bg-zinc-900 px-2 py-2 text-left transition', track?.style.preset === p.id ? 'border-accent' : 'border-border hover:border-accent/50')}>
              <CaptionSwatch preset={p.id} />
              <p className="mt-1 text-2xs text-zinc-300">{p.name}</p>
            </button>
          ))}
        </div>
        {track && (
          <>
            <Field label="Show"><Toggle label="Show captions" checked={track.visible} onChange={(visible) => setTrack((t) => ({ ...t, visible }), 'Toggle captions')} /></Field>
            <Field label="Font"><Select label="Caption font" value={track.style.fontFamily} options={['Inter', 'JetBrains Mono', 'Georgia', 'Arial Black'].map((f) => ({ value: f, label: f }))} onChange={(fontFamily) => setStyle({ fontFamily })} /></Field>
            <Field label="Size"><Slider label="Caption size" min={20} max={140} step={1} value={track.style.fontSizePx} onChange={(fontSizePx) => setStyle({ fontSizePx })} format={(v) => `${v}px`} /></Field>
            <Field label="Weight"><Slider label="Caption weight" min={300} max={900} step={100} value={track.style.fontWeight} onChange={(fontWeight) => setStyle({ fontWeight })} format={String} /></Field>
            <Field label="Text"><ColorInput label="Caption text color" value={track.style.textColor} onChange={(textColor) => setStyle({ textColor })} /></Field>
            <Field label="Active word"><ColorInput label="Active word color" value={track.style.activeWordColor} onChange={(activeWordColor) => setStyle({ activeWordColor })} /></Field>
            <Field label="Background"><div className="flex items-center gap-2"><Toggle label="Caption background" checked={track.style.backgroundColor !== null} onChange={(v) => setStyle({ backgroundColor: v ? 'rgba(0,0,0,0.6)' : null })} />{track.style.backgroundColor && <ColorInput label="Caption background color" value={track.style.backgroundColor} onChange={(backgroundColor) => setStyle({ backgroundColor })} />}</div></Field>
            <Field label="Outline"><Toggle label="Caption outline" checked={track.style.stroke !== null} onChange={(v) => setStyle({ stroke: v ? { color: '#000000', widthPx: 6 } : null })} /></Field>
            <Field label="Uppercase"><Toggle label="Uppercase" checked={track.style.uppercase} onChange={(uppercase) => setStyle({ uppercase })} /></Field>
            <Field label="Position"><Slider label="Vertical position" min={0.05} max={0.95} step={0.01} value={track.style.positionY} onChange={(positionY) => setStyle({ positionY })} format={(v) => `${Math.round(v * 100)}%`} /></Field>
            <Field label="Align"><Segmented label="Caption alignment" value={track.style.align} onChange={(align) => setStyle({ align })} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} /></Field>
            <Field label="Words/line"><Slider label="Words per line" min={1} max={14} step={1} value={track.style.wordsPerLine} onChange={(wordsPerLine) => setStyle({ wordsPerLine })} format={String} /></Field>
            <Field label="Max lines"><Slider label="Maximum lines" min={1} max={4} step={1} value={track.style.maxLines} onChange={(maxLines) => setStyle({ maxLines })} format={String} /></Field>
            <Field label="Speed"><Slider label="Animation speed" min={0.25} max={3} step={0.05} value={track.style.animationSpeed} onChange={(animationSpeed) => setStyle({ animationSpeed })} format={(v) => `${v.toFixed(2)}×`} /></Field>
            <Field label="Safe area"><Slider label="Safe area" min={0} max={0.3} step={0.01} value={track.style.safeAreaX} onChange={(safeAreaX) => setStyle({ safeAreaX })} format={(v) => `${Math.round(v * 100)}%`} /></Field>
            <Field label="Burn in"><Toggle label="Burn captions into export" checked={track.burnIn} onChange={(burnIn) => setTrack((t) => ({ ...t, burnIn }), 'Burn-in')} /></Field>
          </>
        )}
      </Section>

      <Section title={`Captions (${track?.cues.length ?? 0})`} actions={<IconButton size="sm" label="Add caption at playhead" onClick={addCue}><Plus size={13} /></IconButton>}>
        {track && track.cues.length > 0 && (
          <Field label="Sync offset" hint="Shift every caption earlier or later">
            <div className="flex gap-1">
              {[-500, -100, 100, 500].map((d) => <Button key={d} size="sm" className="flex-1 px-1" onClick={() => setCues(shiftCues(track.cues, d), 'Shift captions', 'shift')}>{d > 0 ? '+' : ''}{d}ms</Button>)}
            </div>
          </Field>
        )}
        <ul className="space-y-1.5">
          {(track?.cues ?? []).map((cue, i) => (
            <CueRow key={cue.id} cue={cue} selected={cue.id === selectedCueId}
              onChange={(c, label) => setCues(track!.cues.map((x) => (x.id === cue.id ? c : x)), label, `cue-${cue.id}-${label}`)}
              onDelete={() => setCues(track!.cues.filter((x) => x.id !== cue.id), 'Delete caption')}
              onSplit={() => setCues(track!.cues.flatMap((x) => (x.id === cue.id ? splitCue(x, Math.ceil(x.text.split(/\s+/).length / 2)) : [x])), 'Split caption')}
              onMergeNext={i < track!.cues.length - 1 ? () => setCues(track!.cues.flatMap((x, j) => (j === i ? [mergeCues(x, track!.cues[i + 1]!)] : j === i + 1 ? [] : [x])), 'Merge captions') : undefined}
            />
          ))}
        </ul>
      </Section>
    </>
  );
}

function CueRow({ cue, selected, onChange, onDelete, onSplit, onMergeNext }: {
  cue: SubtitleCue; selected: boolean; onChange(c: SubtitleCue, label: string): void; onDelete(): void; onSplit(): void; onMergeNext?: () => void;
}) {
  const playhead = useEditor((s) => s.playhead);
  const active = playhead >= cue.start && playhead < cue.end;
  const timeInput = (key: 'start' | 'end') => (
    <input aria-label={`Caption ${key}`} type="number" step={0.05} value={(cue[key] / 1000).toFixed(2)}
      onChange={(e) => {
        const v = Math.max(0, Number(e.target.value) * 1000);
        if (Number.isFinite(v)) onChange({ ...cue, [key]: v, words: [] }, 'Caption timing');
      }}
      className="h-6 w-16 rounded border border-border bg-raised px-1 text-2xs tabular-nums" />
  );
  return (
    <li className={clsx('rounded-lg border p-2', selected ? 'border-accent' : active ? 'border-accent/40 bg-accent/5' : 'border-border')}>
      <div className="mb-1 flex items-center gap-1 text-2xs text-muted">
        <button type="button" className="tabular-nums hover:text-fg" onClick={() => { useEditor.getState().seek(cue.start); useEditor.getState().selectCue(cue.id); }}>{formatTime(cue.start)}</button>
        <span className="flex-1" />
        {timeInput('start')}–{timeInput('end')}
        <IconButton size="sm" label="Split caption" onClick={onSplit}><Scissors size={11} /></IconButton>
        {onMergeNext && <IconButton size="sm" label="Merge with next" onClick={onMergeNext}><Merge size={11} /></IconButton>}
        <IconButton size="sm" label="Delete caption" onClick={onDelete}><Trash2 size={11} /></IconButton>
      </div>
      <textarea aria-label="Caption text" value={cue.text} rows={2} onChange={(e) => onChange(editCueText(cue, e.target.value), 'Edit caption')} className="w-full resize-none rounded border-0 bg-transparent p-0 text-xs focus:ring-0" />
      {selected && cue.words.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {cue.words.map((w, i) => (
            <button key={i} type="button" title={`${(w.start / 1000).toFixed(2)}s – ${(w.end / 1000).toFixed(2)}s${w.confidence !== undefined ? ` · ${Math.round(w.confidence * 100)}%` : ''}`}
              onClick={() => useEditor.getState().seek(w.start)}
              className={clsx('rounded px-1 text-2xs', playhead >= w.start && playhead < w.end ? 'bg-accent text-white' : 'bg-raised', w.confidence !== undefined && w.confidence < 0.5 && 'underline decoration-amber-500 decoration-wavy')}>
              {w.text}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

function CaptionSwatch({ preset }: { preset: CaptionStyle['preset'] }) {
  const base = 'text-[11px] font-bold';
  switch (preset) {
    case 'wordHighlight': return <p className={base}><span className="text-white">Hello </span><span className="text-yellow-400">world</span></p>;
    case 'karaoke': return <p className={base}><span className="text-cyan-400">Hel</span><span className="text-white">lo world</span></p>;
    case 'pop': return <p className={clsx(base, 'text-white')}>Hello <span className="inline-block scale-125">world</span></p>;
    case 'bounce': return <p className={clsx(base, 'text-white')}>Hello <span className="inline-block -translate-y-1">world</span></p>;
    case 'typewriter': return <p className="font-mono text-[11px] text-white">Hello wo▍</p>;
    case 'cinematic': return <p className="text-[12px] font-light tracking-widest text-white">Hello world</p>;
    case 'social': return <p className="text-[12px] font-black uppercase text-white [text-shadow:0_0_2px_#000]">HELLO <span className="text-lime-400">WORLD</span></p>;
    case 'minimal': return <p className="text-[10px] font-medium text-white/90">Hello world</p>;
    case 'custom': return <p className="text-[11px] text-white/70">Your style</p>;
    default: return <p className={clsx(base, 'inline-block rounded bg-black/60 px-1 text-white')}>Hello world</p>;
  }
}
