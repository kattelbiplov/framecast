import { aspectSize, composeFrame, renderScene } from '@framecast/compositor';
import { RESOLUTION_OPTIONS, SOCIAL_PRESETS, containerFor, estimateFileSize, formatBytes } from '@framecast/export';
import type { ExportSettings } from '@framecast/schema';
import clsx from 'clsx';
import { CheckCircle2, FolderOpen, Loader2, X, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ExportJobView } from '../../../../shared/ipc';
import { errorMessage, formatDuration } from '../../lib/format';
import { invoke, subscribe } from '../../lib/ipc';
import { toast } from '../../stores/app';
import { useEditor } from '../../stores/editor';
import { Button, IconButton } from '../ui/Button';
import { Field, Section, Segmented, Select, Toggle } from '../ui/controls';
import { Dialog } from '../ui/Dialog';

export function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const project = useEditor((s) => s.project)!;
  const duration = useEditor((s) => s.duration);
  const apply = useEditor((s) => s.apply);
  const [jobs, setJobs] = useState<ExportJobView[]>([]);
  const s = project.export;
  const set = (patch: Partial<ExportSettings>) => apply('Export settings', (p) => ({ ...p, export: { ...p.export, ...patch } }), 'export-settings');

  useEffect(() => {
    void invoke('export:jobs').then((j) => setJobs(j ?? []));
    return subscribe('export:jobs', setJobs);
  }, []);

  const size = aspectSize(project.canvas.aspect, s.height, project.canvas.size);
  const estimate = estimateFileSize(s, size, duration);
  const ext = containerFor(s);

  const start = async () => {
    try {
      await useEditor.getState().save(); // the exporter reads the saved project
      const outputPath = await invoke('export:chooseOutput', project.name, ext);
      if (!outputPath) return;
      await invoke('export:start', { projectId: project.id, settings: s, outputPath, range: { start: 0, end: duration } });
      toast('info', 'Export started — you can keep editing.');
    } catch (e) {
      toast('error', errorMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Export" description={`${formatDuration(duration)} · ${size.width}×${size.height} · ${s.fps} fps`} wide
      footer={<><span className="mr-auto self-center text-xs text-muted">Estimated size ≈ {formatBytes(estimate)}</span><Button onClick={() => onOpenChange(false)}>Close</Button><Button variant="primary" onClick={() => void start()}>Export {ext.toUpperCase()}…</Button></>}>
      <div className="grid grid-cols-[1fr_340px]">
        <div className="space-y-4 border-r border-border p-5">
          <OutputPreview />
          <div>
            <p className="mb-2 text-xs font-semibold">Presets</p>
            <div className="grid grid-cols-3 gap-1.5">
              {SOCIAL_PRESETS.map((p) => (
                <button key={p.id} type="button" onClick={() => {
                  set(p.settings);
                  if (p.aspect !== project.canvas.aspect) apply('Aspect ratio', (pr) => ({ ...pr, canvas: { ...pr.canvas, aspect: p.aspect, size: aspectSize(p.aspect, 1080) } }));
                }} className="rounded-lg border border-border px-2 py-1.5 text-left hover:border-accent/60">
                  <p className="text-xs font-medium">{p.name}</p>
                  <p className="text-2xs text-muted">{p.aspect} · {p.settings.height}p{p.maxDurationSec && duration / 1000 > p.maxDurationSec ? ' · too long' : ''}</p>
                </button>
              ))}
            </div>
          </div>
          {jobs.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold">Export queue</p>
              <ul className="space-y-1.5">{jobs.map((j) => <JobRow key={j.id} job={j} />)}</ul>
            </div>
          )}
        </div>
        <div>
          <Section title="Format">
            <Field label="Format"><Segmented label="Format" value={s.format} onChange={(format) => set({ format, videoCodec: format === 'webm' ? 'vp9' : format === 'gif' ? 'gif' : format === 'mov' ? 'prores' : 'h264', audioCodec: format === 'gif' ? 'none' : format === 'webm' ? 'opus' : 'aac' })}
              options={[{ value: 'mp4', label: 'MP4' }, { value: 'mov', label: 'MOV' }, { value: 'webm', label: 'WebM' }, { value: 'gif', label: 'GIF' }, { value: 'audio', label: 'Audio' }]} /></Field>
            {(s.format === 'mp4' || s.format === 'mov') && (
              <Field label="Codec"><Select label="Video codec" value={s.videoCodec} onChange={(videoCodec) => set({ videoCodec })} options={[{ value: 'h264', label: 'H.264 (compatible)' }, { value: 'hevc', label: 'HEVC (smaller)' }, ...(s.format === 'mov' ? [{ value: 'prores' as const, label: 'ProRes (editing)' }] : [])]} /></Field>
            )}
            {s.format === 'audio' && <Field label="Codec"><Select label="Audio codec" value={s.audioCodec === 'none' ? 'aac' : s.audioCodec} onChange={(audioCodec) => set({ audioCodec })} options={[{ value: 'aac', label: 'AAC (.m4a)' }, { value: 'mp3', label: 'MP3' }, { value: 'opus', label: 'Opus (.ogg)' }]} /></Field>}
          </Section>
          {s.format !== 'audio' && (
            <Section title="Video">
              <Field label="Resolution"><Select label="Resolution" value={String(s.height)} onChange={(v) => set({ height: Number(v) })} options={RESOLUTION_OPTIONS.map((r): { value: string; label: string } => ({ value: String(r.height), label: r.label })).concat(s.format === 'gif' ? [{ value: '480', label: '480p' }] : [])} /></Field>
              <Field label="Frame rate"><Segmented label="Frame rate" value={String(s.fps) as '24' | '30' | '60'} onChange={(v) => set({ fps: Number(v) })} options={[{ value: '24', label: '24' }, { value: '30', label: '30' }, { value: '60', label: '60' }]} /></Field>
              <Field label="Quality"><Segmented label="Quality" value={s.quality} onChange={(quality) => set({ quality })} options={[{ value: 'draft', label: 'Draft' }, { value: 'standard', label: 'Std' }, { value: 'high', label: 'High' }, { value: 'lossless', label: 'Max' }]} /></Field>
              <Field label="Hardware" hint="Use VideoToolbox on macOS when available"><Toggle label="Hardware acceleration" checked={s.hardwareAcceleration} onChange={(hardwareAcceleration) => set({ hardwareAcceleration })} /></Field>
              {(s.format === 'mov' || s.format === 'webm') && <Field label="Transparent" hint="Omit the background (ProRes 4444 / VP9 alpha)"><Toggle label="Transparent background" checked={s.transparentBackground} onChange={(transparentBackground) => set({ transparentBackground })} /></Field>}
            </Section>
          )}
          <Section title="Subtitles">
            <Field label="Burn in"><Toggle label="Burn in captions" checked={s.burnSubtitles} onChange={(burnSubtitles) => set({ burnSubtitles })} /></Field>
            <Field label="Sidecar"><Segmented label="Subtitle file" value={s.exportSubtitleFile} onChange={(exportSubtitleFile) => set({ exportSubtitleFile })} options={[{ value: 'none', label: 'None' }, { value: 'srt', label: 'SRT' }, { value: 'vtt', label: 'VTT' }]} /></Field>
          </Section>
        </div>
      </div>
    </Dialog>
  );
}

function OutputPreview() {
  const ref = useRef<HTMLCanvasElement>(null);
  const comp = useEditor((s) => s.composition);
  const playhead = useEditor((s) => s.playhead);
  const project = useEditor((s) => s.project)!;
  useEffect(() => {
    const c = ref.current;
    if (!c || !comp) return;
    const w = 480;
    const h = Math.round((w * project.canvas.size.height) / project.canvas.size.width);
    c.width = w;
    c.height = h;
    // Draw without media (structure preview) — it shows layout, frame, captions and overlays.
    renderScene({ ctx: c.getContext('2d')!, width: w, height: h, createScratch: (sw, sh) => { const o = new OffscreenCanvas(Math.max(1, sw), Math.max(1, sh)); return { canvas: o, ctx: o.getContext('2d')! }; } },
      composeFrame(comp, playhead), { frame: () => null });
  }, [comp, playhead, project.canvas.size]);
  return <canvas ref={ref} className="checker mx-auto max-h-56 w-auto max-w-full rounded-lg ring-1 ring-border" aria-label="Output layout preview" />;
}

function JobRow({ job }: { job: ExportJobView }) {
  return (
    <li className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-xs">
      {job.status === 'running' || job.status === 'queued' ? <Loader2 size={14} className="animate-spin text-accent" /> : job.status === 'done' ? <CheckCircle2 size={14} className="text-emerald-500" /> : <XCircle size={14} className="text-danger" />}
      <div className="min-w-0 flex-1">
        <p className="truncate">{job.outputPath.split(/[\\/]/).pop()}</p>
        {job.status === 'failed' ? <p className="truncate text-2xs text-danger" title={job.error}>{job.error}</p> : (
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-raised"><div className={clsx('h-full rounded-full', job.status === 'done' ? 'bg-emerald-500' : 'bg-accent')} style={{ width: `${Math.round(job.progress * 100)}%` }} /></div>
        )}
      </div>
      <span className="w-9 text-right tabular-nums text-2xs text-muted">{job.status === 'queued' ? 'queued' : `${Math.round(job.progress * 100)}%`}</span>
      {(job.status === 'running' || job.status === 'queued') && <IconButton size="sm" label="Cancel export" onClick={() => void invoke('export:cancel', job.id)}><X size={12} /></IconButton>}
      {job.status === 'done' && <IconButton size="sm" label="Show in Finder" onClick={() => void invoke('export:reveal', job.outputPath)}><FolderOpen size={12} /></IconButton>}
    </li>
  );
}
