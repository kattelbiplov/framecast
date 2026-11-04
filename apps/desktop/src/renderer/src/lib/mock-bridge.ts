/**
 * In-memory implementation of the preload bridge for running the renderer in a normal browser
 * (`npm run dev` → open the Vite URL, UI tests, screenshots). It fakes a library with one demo
 * project whose "screen recording" is a generated image plus synthetic cursor events.
 */
import { AppSettings, createProject, type InteractionEvent, type Project, type RecordingMetadata } from '@framecast/schema';
import type {
  EventChannel,
  EventChannels,
  FramecastBridge,
  InvokeChannels,
  LibraryEntry,
  OpenedProject,
  RecordingState,
} from '../../../shared/ipc';
import { addRecordingToProjectForDemo } from './demo-project';

type Listeners = { [C in EventChannel]?: Set<(p: EventChannels[C]) => void> };

function demoScreenImage(): string {
  const c = document.createElement('canvas');
  c.width = 1920;
  c.height = 1080;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f5f5f7';
  g.fillRect(0, 0, 1920, 1080);
  g.fillStyle = '#e8e8ed';
  g.fillRect(0, 0, 1920, 56);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(30 + i * 26, 28, 8, 0, Math.PI * 2);
    g.fill();
  });
  g.fillStyle = '#ffffff';
  g.fillRect(0, 56, 300, 1024);
  g.fillStyle = '#1d1d1f';
  g.font = '600 28px Inter, sans-serif';
  g.fillText('Acme Dashboard', 340, 130);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i === 2 ? '#e0e7ff' : 'transparent';
    g.fillRect(16, 90 + i * 52, 268, 40);
    g.fillStyle = '#3a3a3c';
    g.font = '500 20px Inter, sans-serif';
    g.fillText(['Overview', 'Projects', 'Analytics', 'Customers', 'Billing', 'Team', 'Integrations', 'Settings'][i]!, 36, 118 + i * 52);
  }
  const cards = [['Revenue', '$48,210'], ['Active users', '12,847'], ['Conversion', '4.6%']];
  cards.forEach(([label, value], i) => {
    const x = 340 + i * 520;
    g.fillStyle = '#fff';
    g.fillRect(x, 170, 490, 170);
    g.fillStyle = '#6e6e73';
    g.font = '500 20px Inter, sans-serif';
    g.fillText(label!, x + 28, 216);
    g.fillStyle = '#1d1d1f';
    g.font = '700 48px Inter, sans-serif';
    g.fillText(value!, x + 28, 290);
  });
  g.fillStyle = '#fff';
  g.fillRect(340, 370, 1530, 640);
  g.strokeStyle = '#6366f1';
  g.lineWidth = 5;
  g.beginPath();
  for (let i = 0; i <= 30; i++) {
    const x = 380 + i * 48;
    const y = 900 - Math.sin(i / 4) * 120 - i * 12;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  g.fillStyle = '#6366f1';
  g.fillRect(1640, 100, 200, 52);
  g.fillStyle = '#fff';
  g.font = '600 20px Inter, sans-serif';
  g.fillText('New report', 1684, 134);
  return c.toDataURL('image/png');
}

function demoEvents(): InteractionEvent[] {
  const pts: [number, number, number][] = [
    [0, 0.5, 0.6], [1500, 0.08, 0.2], [2500, 0.08, 0.205], [4000, 0.3, 0.2], [6000, 0.9, 0.12],
    [7000, 0.9, 0.12], [9500, 0.6, 0.6], [12000, 0.7, 0.55], [14000, 0.4, 0.3], [16000, 0.4, 0.3],
  ];
  const ev: InteractionEvent[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [t0, x0, y0] = pts[i]!;
    const [t1, x1, y1] = pts[i + 1]!;
    for (let t = t0; t < t1; t += 16) {
      const p = (t - t0) / (t1 - t0);
      const e = p * p * (3 - 2 * p);
      ev.push({ type: 'move', t, x: x0 + (x1 - x0) * e + Math.sin(t / 90) * 0.001, y: y0 + (y1 - y0) * e });
    }
  }
  const click = (t: number, x: number, y: number) => {
    ev.push({ type: 'down', t, x, y, button: 'left' }, { type: 'up', t: t + 90, x, y, button: 'left' });
  };
  click(2500, 0.08, 0.205);
  click(7000, 0.9, 0.12);
  click(16000, 0.4, 0.3);
  return ev.sort((a, b) => a.t - b.t);
}

export function createMockBridge(): FramecastBridge {
  const listeners: Listeners = {};
  const emit = <C extends EventChannel>(c: C, p: EventChannels[C]) => listeners[c]?.forEach((l) => (l as (x: EventChannels[C]) => void)(p));
  let settings = AppSettings.parse({});
  const projects = new Map<string, OpenedProject>();
  let recState: RecordingState = { phase: 'idle', sessionId: null, engine: null, elapsedMs: 0, countdownRemaining: 0, error: null, projectId: null };

  const makeDemo = (name: string): OpenedProject => {
    const rec: RecordingMetadata = {
      schemaVersion: 1, id: `rec_demo${projects.size}`, createdAt: new Date().toISOString(), appVersion: 'dev',
      engine: 'chromium', source: { kind: 'display', displayId: '1', name: 'Demo display' },
      captureSize: { width: 1920, height: 1080 }, durationMs: 18000, cursorBakedIn: false,
      tracks: [{ id: 'trk_demo', kind: 'screen', file: 'screen.png', mimeType: 'image/png', durationMs: 18000, startOffsetMs: 0, size: { width: 1920, height: 1080 } }],
      events: demoEvents(), pauses: [], recovered: false,
    };
    const project: Project = addRecordingToProjectForDemo(createProject(name), rec);
    const screen = project.assets.find((a) => a.role === 'screen')!;
    return { project, dir: '/demo', recordings: [rec], mediaUrls: { [screen.id]: demoScreenImage() } };
  };
  const first = makeDemo('Product walkthrough');
  projects.set(first.project.id, first);

  const entry = (o: OpenedProject): LibraryEntry => ({
    id: o.project.id, name: o.project.name, dir: o.dir, createdAt: o.project.createdAt, updatedAt: o.project.updatedAt,
    durationMs: 18000, thumbnailPath: null,
  });

  const handlers: Partial<{ [C in keyof InvokeChannels]: (...a: Parameters<InvokeChannels[C]>) => unknown }> = {
    'app:info': () => ({ version: '0.1.0-dev', platform: 'browser', arch: 'x64', nativeCapture: false, libraryDir: '~/Movies/Framecast' }),
    'settings:get': () => settings,
    'settings:update': (patch) => (settings = AppSettings.parse({ ...settings, ...patch })),
    'permissions:status': () => ({ screen: 'granted', microphone: 'granted', camera: 'granted', accessibility: 'denied' }),
    'permissions:request': () => 'granted',
    'capture:sources': () => [
      { id: 'screen:1:0', kind: 'display', name: 'Built-in Retina Display (1728×1117)' },
      { id: 'screen:2:0', kind: 'display', name: 'Studio Display (2560×1440)' },
      { id: 'window:1', kind: 'window', name: 'Safari — Acme Dashboard' },
      { id: 'window:2', kind: 'window', name: 'Visual Studio Code' },
    ],
    'recording:state': () => recState,
    'recording:start': () => {
      recState = { ...recState, phase: 'countdown', sessionId: 'mock', engine: 'chromium', countdownRemaining: 3 };
      emit('recording:state', recState);
      return recState;
    },
    'recording:stop': () => {
      const demo = makeDemo(`Recording ${new Date().toLocaleTimeString()}`);
      projects.set(demo.project.id, demo);
      recState = { ...recState, phase: 'idle', projectId: demo.project.id };
      emit('recording:state', recState);
      return recState;
    },
    'recording:cancel': () => {
      recState = { ...recState, phase: 'idle' };
      emit('recording:state', recState);
      return recState;
    },
    'recording:recoveries': () => [],
    'library:list': () => [...projects.values()].map(entry),
    'project:create': (name) => {
      const o = makeDemo(name);
      projects.set(o.project.id, o);
      return o;
    },
    'project:open': (id) => {
      const o = projects.get(id);
      if (!o) throw new Error('Not found');
      return o;
    },
    'project:openDialog': () => null,
    'project:save': (project) => {
      const o = projects.get(project.id);
      if (o) projects.set(project.id, { ...o, project });
      return { updatedAt: new Date().toISOString() };
    },
    'project:delete': (id) => void projects.delete(id),
    'project:importMedia': () => ({ assets: [], mediaUrls: {} }),
    'project:saveThumbnail': () => undefined,
    'subtitles:import': () => null,
    'subtitles:export': () => null,
    'transcription:availability': () => ({ available: false, reason: 'Transcription needs the desktop app with whisper.cpp installed.' }),
    'export:jobs': () => [],
    'export:chooseOutput': (name, ext) => `~/Downloads/${name}.${ext}`,
    'export:start': () => {
      throw new Error('Exporting requires the desktop app (ffmpeg).');
    },
  };

  return {
    invoke: async (channel, ...args) => {
      const h = handlers[channel] as ((...a: unknown[]) => unknown) | undefined;
      if (!h) return undefined as never;
      return (await h(...args)) as never;
    },
    on: (channel, listener) => {
      const map = listeners as Record<string, Set<(p: unknown) => void> | undefined>;
      const set = (map[channel] ??= new Set()) as Set<typeof listener>;
      set.add(listener);
      return () => set.delete(listener);
    },
  };
}
