import clsx from 'clsx';
import { AppWindow, ArrowLeft, Camera, Circle, Mic, Monitor, MousePointer2, RefreshCw, ShieldAlert, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaptureSourceInfo, PermissionStatus, RecordingOptions } from '../../../shared/ipc';
import { Button, IconButton } from '../components/ui/Button';
import { Field, Section, Segmented, Select, Toggle } from '../components/ui/controls';
import { errorMessage } from '../lib/format';
import { invoke } from '../lib/ipc';
import { recordingController } from '../recording/chromium-recorder';
import { toast, useApp } from '../stores/app';
import { useRecording } from '../stores/recording';

type RegionPreset = 'full' | 'center' | 'left' | 'right';
const REGIONS: Record<RegionPreset, RecordingOptions['region']> = {
  full: null,
  center: { x: 0.125, y: 0.125, width: 0.75, height: 0.75 },
  left: { x: 0, y: 0, width: 0.5, height: 1 },
  right: { x: 0.5, y: 0, width: 0.5, height: 1 },
};

export function RecordingSetupScreen() {
  const navigate = useApp((s) => s.navigate);
  const settings = useApp((s) => s.settings)!;
  const info = useApp((s) => s.info);
  const updateSettings = useApp((s) => s.updateSettings);
  const phase = useRecording((s) => s.state.phase);
  const rec = settings.recording;

  const [sources, setSources] = useState<CaptureSourceInfo[]>([]);
  const [kind, setKind] = useState<'display' | 'window'>('display');
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [region, setRegion] = useState<RegionPreset>('full');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [perm, setPerm] = useState<PermissionStatus | null>(null);
  const [name, setName] = useState('');
  const [starting, setStarting] = useState(false);

  const loadSources = useCallback(async () => {
    const list = await invoke('capture:sources');
    setSources(list);
    setSourceId((cur) => cur ?? list.find((s) => s.kind === 'display')?.id ?? null);
  }, []);

  useEffect(() => {
    void loadSources().catch((e) => toast('error', errorMessage(e)));
    void invoke('permissions:status').then(setPerm);
    const loadDevices = () => navigator.mediaDevices?.enumerateDevices().then(setDevices).catch(() => undefined);
    void loadDevices();
    navigator.mediaDevices?.addEventListener('devicechange', loadDevices);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', loadDevices);
  }, [loadSources]);

  const mics = devices.filter((d) => d.kind === 'audioinput');
  const cams = devices.filter((d) => d.kind === 'videoinput');
  const setRec = (patch: Partial<typeof rec>) => void updateSettings({ recording: { ...rec, ...patch } });

  const start = async () => {
    setStarting(true);
    const selected = sources.find((s) => s.id === sourceId);
    const opts: RecordingOptions = {
      sourceId,
      region: selected?.kind === 'display' ? REGIONS[region] : null,
      fps: rec.fps,
      microphoneDeviceId: rec.captureMicrophone ? (rec.microphoneDeviceId ?? '') : null,
      webcamDeviceId: rec.captureWebcam ? (rec.webcamDeviceId ?? '') : null,
      systemAudio: rec.captureSystemAudio,
      countdownSec: rec.countdownSec,
      trackInteractions: rec.trackInteractions,
      trackShortcuts: rec.trackShortcuts,
      hideCursor: rec.hideCursorInVideo,
      projectName: name || undefined,
    };
    try {
      await recordingController.begin(opts, info?.nativeCapture ?? false);
    } catch (e) {
      toast('error', `Could not start recording: ${errorMessage(e)}`);
    } finally {
      setStarting(false);
    }
  };

  const busy = phase !== 'idle' && phase !== 'error';
  const visible = sources.filter((s) => s.kind === kind);
  const missing = perm ? (Object.entries(perm) as [keyof PermissionStatus, string][]).filter(([k, v]) => v !== 'granted' && (k !== 'accessibility' || rec.trackInteractions)) : [];

  return (
    <div className="flex h-full flex-col">
      <header className="drag-region flex h-12 shrink-0 items-center gap-2 border-b border-border pl-20 pr-3">
        <IconButton className="no-drag" label="Back" onClick={() => navigate({ name: 'home' })}><ArrowLeft size={16} /></IconButton>
        <h1 className="font-semibold">New recording</h1>
      </header>
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-auto p-6">
          {missing.length > 0 && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <ShieldAlert size={16} className="mt-0.5 text-amber-500" />
              <div className="flex-1 space-y-1">
                <p className="font-medium text-sm">Permissions needed</p>
                {missing.map(([k]) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="capitalize">{k === 'accessibility' ? 'Accessibility (click & shortcut tracking)' : `${k} access`}</span>
                    <Button size="sm" onClick={() => void invoke('permissions:request', k).then(() => invoke('permissions:status')).then(setPerm)}>Grant…</Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mb-4 flex items-center justify-between">
            <Segmented<'display' | 'window'> label="Source type" value={kind} onChange={setKind} options={[
              { value: 'display', label: <span className="flex items-center gap-1.5"><Monitor size={13} /> Displays</span> },
              { value: 'window', label: <span className="flex items-center gap-1.5"><AppWindow size={13} /> Windows</span> },
            ]} />
            <IconButton label="Refresh sources" onClick={() => void loadSources()}><RefreshCw size={15} /></IconButton>
          </div>
          <ul className="grid grid-cols-3 gap-4">
            {visible.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setSourceId(s.id)} aria-pressed={sourceId === s.id} className={clsx('w-full overflow-hidden rounded-xl border-2 bg-panel text-left transition', sourceId === s.id ? 'border-accent' : 'border-transparent hover:border-border')}>
                  <div className="relative aspect-video bg-raised">
                    {s.thumbnailDataUrl ? <img src={s.thumbnailDataUrl} alt="" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-muted">{s.kind === 'display' ? <Monitor size={28} /> : <AppWindow size={28} />}</div>}
                    {sourceId === s.id && s.kind === 'display' && REGIONS[region] && (
                      <div className="absolute border-2 border-dashed border-accent bg-accent/10" style={{ left: `${REGIONS[region]!.x * 100}%`, top: `${REGIONS[region]!.y * 100}%`, width: `${REGIONS[region]!.width * 100}%`, height: `${REGIONS[region]!.height * 100}%` }} />
                    )}
                  </div>
                  <p className="truncate px-3 py-2 text-xs font-medium">{s.name}</p>
                </button>
              </li>
            ))}
          </ul>
          {kind === 'display' && (
            <div className="mt-4 w-96">
              <Field label="Area">
                <Segmented<RegionPreset> label="Recording area" value={region} onChange={setRegion} options={[
                  { value: 'full', label: 'Full screen' }, { value: 'center', label: 'Center' }, { value: 'left', label: 'Left half' }, { value: 'right', label: 'Right half' },
                ]} />
              </Field>
            </div>
          )}
        </main>

        <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-panel">
          <div className="min-h-0 flex-1 overflow-auto">
            <Section title="Audio">
              <Field label="Microphone">
                <div className="flex items-center gap-2">
                  <Toggle label="Record microphone" checked={rec.captureMicrophone} onChange={(v) => setRec({ captureMicrophone: v })} />
                  <Select label="Microphone device" value={rec.microphoneDeviceId ?? ''} onChange={(v) => setRec({ microphoneDeviceId: v || null })} options={[{ value: '', label: 'Default' }, ...mics.map((d) => ({ value: d.deviceId, label: d.label || 'Microphone' }))]} />
                </div>
              </Field>
              <Field label="System audio"><Toggle label="Record system audio" checked={rec.captureSystemAudio} onChange={(v) => setRec({ captureSystemAudio: v })} /></Field>
              {rec.captureMicrophone && <MicMeter deviceId={rec.microphoneDeviceId} />}
            </Section>
            <Section title="Camera">
              <Field label="Webcam">
                <div className="flex items-center gap-2">
                  <Toggle label="Record webcam" checked={rec.captureWebcam} onChange={(v) => setRec({ captureWebcam: v })} />
                  <Select label="Camera device" value={rec.webcamDeviceId ?? ''} onChange={(v) => setRec({ webcamDeviceId: v || null })} options={[{ value: '', label: 'Default' }, ...cams.map((d) => ({ value: d.deviceId, label: d.label || 'Camera' }))]} />
                </div>
              </Field>
              {rec.captureWebcam && <CameraPreview deviceId={rec.webcamDeviceId} />}
            </Section>
            <Section title="Quality">
              <Field label="Frame rate"><Segmented label="Frame rate" value={String(rec.fps) as '24' | '30' | '60'} onChange={(v) => setRec({ fps: Number(v) as 24 | 30 | 60 })} options={[{ value: '24', label: '24' }, { value: '30', label: '30' }, { value: '60', label: '60' }]} /></Field>
              <Field label="Countdown"><Segmented label="Countdown" value={String(rec.countdownSec) as '0' | '3' | '5'} onChange={(v) => setRec({ countdownSec: Number(v) })} options={[{ value: '0', label: 'Off' }, { value: '3', label: '3s' }, { value: '5', label: '5s' }]} /></Field>
            </Section>
            <Section title="Cursor & interactions">
              <Field label="Track clicks" hint="Records cursor movement and clicks for auto-zoom and cursor effects"><Toggle label="Track interactions" checked={rec.trackInteractions} onChange={(v) => setRec({ trackInteractions: v })} /></Field>
              <Field label="Shortcuts" hint="Records modifier shortcuts like ⌘C. Plain typing is never recorded."><Toggle label="Track keyboard shortcuts" checked={rec.trackShortcuts} onChange={(v) => setRec({ trackShortcuts: v })} /></Field>
              <Field label="Hide cursor" hint="Omit the OS cursor from video so it can be restyled in the editor (native engine)"><Toggle label="Hide cursor in video" checked={rec.hideCursorInVideo} onChange={(v) => setRec({ hideCursorInVideo: v })} /></Field>
              {!info?.nativeCapture && (
                <p className="flex gap-1.5 rounded-lg bg-raised p-2 text-2xs text-muted"><MousePointer2 size={12} className="mt-px shrink-0" />The fallback engine records the system cursor into the video, so cursor styling is limited. Clicks are tracked for auto zoom (macOS needs Accessibility access). Install the native capture helper for a fully restylable cursor.</p>
              )}
            </Section>
            <Section title="Project">
              <input aria-label="Project name" placeholder="Project name (optional)" value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-full rounded-md border border-border bg-raised px-2 text-xs" />
            </Section>
          </div>
          <div className="border-t border-border p-3">
            <Button variant="record" size="lg" className="w-full" disabled={!sourceId || busy || starting} onClick={() => void start()} icon={<Circle size={14} fill="currentColor" />}>
              {busy ? 'Recording…' : starting ? 'Starting…' : 'Start recording'}
            </Button>
            <p className="mt-2 text-center text-2xs text-muted">{settings.shortcuts.startStopRecording.replace('CommandOrControl', '⌘')} to stop · <Volume2 size={10} className="inline" /> {rec.captureSystemAudio ? 'system audio on' : 'system audio off'} · <Mic size={10} className="inline" /> {rec.captureMicrophone ? 'mic on' : 'mic off'} · <Camera size={10} className="inline" /> {rec.captureWebcam ? 'camera on' : 'camera off'}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CameraPreview({ deviceId }: { deviceId: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    void navigator.mediaDevices?.getUserMedia({ video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: 640 } }).then((s) => {
      if (cancelled) return s.getTracks().forEach((t) => t.stop());
      stream = s;
      if (ref.current) ref.current.srcObject = s;
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [deviceId]);
  return <video ref={ref} autoPlay muted playsInline className="aspect-video w-full rounded-lg bg-black object-cover -scale-x-100" />;
}

function MicMeter({ deviceId }: { deviceId: string | null }) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let ctx: AudioContext | null = null;
    let cancelled = false;
    void navigator.mediaDevices?.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined } }).then((s) => {
      if (cancelled) return s.getTracks().forEach((t) => t.stop());
      stream = s;
      ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(s).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        raf = requestAnimationFrame(tick);
      };
      tick();
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
    };
  }, [deviceId]);
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-raised" role="meter" aria-label="Microphone level" aria-valuenow={Math.round(level * 100)}>
      <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-75" style={{ width: `${level * 100}%` }} />
    </div>
  );
}
