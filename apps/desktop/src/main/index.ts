import { parseSubtitleFile, toSrt, toVtt } from '@framecast/subtitles';
import {
  BrowserWindow,
  Menu,
  app,
  desktopCapturer,
  dialog,
  globalShortcut,
  session,
  shell,
  type WebContents,
} from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { EventChannel, EventChannels, MenuCommand, RecordingState } from '../shared/ipc.js';
import { registerIpc } from './ipc/register.js';
import { configureLogFile, createLogger } from './lib/logger.js';
import { paths } from './lib/paths.js';
import { buildMenu } from './menu.js';
import { NativeCaptureBridge } from './services/capture/native-bridge.js';
import { listCaptureSources } from './services/capture/sources.js';
import { ExportService } from './services/export-service.js';
import { FfmpegService } from './services/ffmpeg.js';
import { MediaProtocol } from './services/media-protocol.js';
import { permissions } from './services/permissions.js';
import { ProjectStore } from './services/projects.js';
import { RecordingSessionManager } from './services/recording/session-manager.js';
import { SettingsService } from './services/settings.js';
import { TranscriptionService } from './services/transcription.js';
import { createExportWindow } from './windows/export-window.js';
import { rendererOrigins } from './windows/load.js';
import { createMainWindow } from './windows/main-window.js';
import { createOverlayWindow } from './windows/overlay-window.js';

const log = createLogger('app');

if (!app.requestSingleInstanceLock()) app.quit();
MediaProtocol.registerScheme();

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;

function send<C extends EventChannel>(target: WebContents | undefined, channel: C, payload: EventChannels[C]): void {
  if (target && !target.isDestroyed()) target.send(channel, payload);
}

function broadcast<C extends EventChannel>(channel: C, payload: EventChannels[C]): void {
  for (const w of BrowserWindow.getAllWindows()) send(w.webContents, channel, payload);
}

async function bootstrap(): Promise<void> {
  configureLogFile(paths.logFile());
  log.info(`Starting Framecast ${app.getVersion()} on ${process.platform}/${process.arch}`);

  /* ---------------------------------------------------------------- services */
  const settings = new SettingsService(paths.settingsFile());
  await settings.load();
  const libraryDir = () => settings.get().libraryDir ?? paths.defaultLibraryDir();
  const media = new MediaProtocol();
  media.handle();
  const ffmpeg = new FfmpegService(() => settings.get().ffmpegPath, paths.resourcesBin());
  const store = new ProjectStore(paths.libraryIndex(), libraryDir, media, ffmpeg);
  await store.init();
  const native = new NativeCaptureBridge(paths.resourcesBin());
  const recorder = new RecordingSessionManager({
    sessionsDir: () => join(libraryDir(), '.sessions'),
    store,
    ffmpeg,
    native,
    excludedBundleIds: () => settings.get().recording.excludedBundleIds,
    broadcast: (state) => onRecordingState(state),
  });
  const exporter = new ExportService({
    store,
    ffmpeg,
    createRenderWindow: createExportWindow,
    broadcast: (jobs) => broadcast('export:jobs', jobs),
  });
  const transcription = new TranscriptionService({
    ffmpeg,
    settings: () => settings.get().transcription,
    dataDir: join(paths.userData(), 'whisper'),
  });

  /* ---------------------------------------------------------------- recording UI */
  let lastPhase: RecordingState['phase'] = 'idle';
  function onRecordingState(state: RecordingState): void {
    broadcast('recording:state', state);
    if (state.phase === lastPhase) return;
    const active = state.phase === 'countdown' || state.phase === 'recording' || state.phase === 'paused';
    if (active && !overlayWindow) {
      overlayWindow = createOverlayWindow();
      overlayWindow.once('ready-to-show', () => overlayWindow?.showInactive());
      overlayWindow.on('closed', () => (overlayWindow = null));
      mainWindow?.minimize();
    } else if (!active && overlayWindow) {
      overlayWindow.destroy();
      overlayWindow = null;
      if (mainWindow) {
        mainWindow.restore();
        mainWindow.focus();
      }
    }
    lastPhase = state.phase;
  }

  // Chromium engine: answer getDisplayMedia() with the source chosen in Recording Setup.
  let pendingDisplay: { sourceId: string; audio: boolean } | null = null;
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    let source = sources.find((s) => s.id === pendingDisplay?.sourceId);
    if (!source) {
      // Electron cannot cleanly deny a video request; fall back to the primary screen.
      log.warn(`Display source ${pendingDisplay?.sourceId ?? '(none)'} not prepared; using primary screen`);
      source = sources.find((s) => s.id.startsWith('screen:')) ?? sources[0];
    }
    if (!source) return log.error('No capturable display sources');
    // System audio loopback is supported on Windows and macOS 13+; elsewhere fall back to video only.
    const wantsAudio = pendingDisplay?.audio && process.platform !== 'linux';
    callback(wantsAudio ? { video: source, audio: 'loopback' } : { video: source });
  });
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    const trusted = rendererOrigins().some((o) => wc.getURL().startsWith(o));
    cb(trusted && (permission === 'media' || permission === 'display-capture' || permission === 'clipboard-sanitized-write'));
  });

  /* ---------------------------------------------------------------- IPC */
  registerIpc({
    'app:info': async () => ({
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      nativeCapture: await native.isAvailable(),
      libraryDir: libraryDir(),
    }),
    'settings:get': () => settings.get(),
    'settings:update': async (_e, patch) => {
      const next = await settings.update(patch);
      registerShortcuts();
      return next;
    },
    'permissions:status': () => permissions.status(),
    'permissions:request': (_e, kind) => permissions.request(kind),
    'permissions:openSettings': (_e, kind) => permissions.openSettings(kind),

    'capture:sources': () => listCaptureSources(),
    'capture:prepareDisplay': (_e, sourceId, audio) => {
      pendingDisplay = { sourceId, audio };
    },
    'recording:start': (_e, opts) => recorder.start(opts),
    'recording:pause': () => recorder.pause(),
    'recording:resume': () => recorder.resume(),
    'recording:stop': () => recorder.stop(),
    'recording:cancel': () => recorder.cancel(),
    'recording:state': () => recorder.getState(),
    'recording:chunk': (_e, id, kind, mime, data) => recorder.writeChunk(id, kind, mime, data),
    'recording:streamInfo': (_e, id, kind, info) => recorder.setStreamInfo(id, kind, info),
    'recording:streamsDone': (_e, id) => recorder.markStreamsDone(id),
    'recording:recoveries': () => recorder.listRecoveries(),
    'recording:recover': (_e, id) => recorder.recover(id),
    'recording:discardRecovery': (_e, id) => recorder.discardRecovery(id),

    'library:list': () => store.list().map((e) => ({ ...e, thumbnailPath: store.thumbnailUrl(e) })),
    'project:create': (_e, name) => store.create(name),
    'project:open': (_e, id) => store.open(id),
    'project:openDialog': async () => {
      const r = await dialog.showOpenDialog(mainWindow!, {
        title: 'Open Framecast project',
        properties: process.platform === 'darwin' ? ['openFile', 'openDirectory', 'treatPackageAsDirectory'] : ['openDirectory'],
        filters: [{ name: 'Framecast project', extensions: ['framecast', 'json'] }],
      });
      const picked = r.filePaths[0];
      if (r.canceled || !picked) return null;
      return store.openDir(picked.endsWith('.json') ? join(picked, '..') : picked);
    },
    'project:save': (_e, project) => store.save(project),
    'project:rename': (_e, id, name) => store.rename(id, name),
    'project:delete': (_e, id) => store.remove(id, (p) => shell.trashItem(p)),
    'project:reveal': (_e, id) => shell.showItemInFolder(store.dirOf(id)),
    'project:importMedia': async () => {
      const r = await dialog.showOpenDialog(mainWindow!, {
        title: 'Import media',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Media', extensions: ['mp4', 'mov', 'webm', 'mkv', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'png', 'jpg', 'jpeg', 'gif', 'webp'] }],
      });
      return r.canceled ? { assets: [], mediaUrls: {} } : store.importMedia(r.filePaths);
    },
    'project:saveThumbnail': (_e, id, png) => store.saveThumbnail(id, png),

    'subtitles:import': async () => {
      const r = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile'], filters: [{ name: 'Subtitles', extensions: ['srt', 'vtt'] }] });
      const file = r.filePaths[0];
      if (r.canceled || !file) return null;
      return { name: basename(file), cues: parseSubtitleFile(file, await readFile(file, 'utf8')) };
    },
    'subtitles:export': async (_e, cues, format, suggestedName) => {
      const r = await dialog.showSaveDialog(mainWindow!, { defaultPath: `${suggestedName}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
      if (r.canceled || !r.filePath) return null;
      await writeFile(r.filePath, format === 'srt' ? toSrt(cues) : toVtt(cues), 'utf8');
      return r.filePath;
    },
    'audio:detectSilence': async (_e, projectId, assetId, opts) => {
      const opened = await store.open(projectId);
      const asset = opened.project.assets.find((a) => a.id === assetId);
      if (!asset) throw new Error('Asset not found');
      const threshold = Math.min(-10, Math.max(-80, Number(opts.thresholdDb)));
      const minMs = Math.min(10_000, Math.max(100, Number(opts.minSilenceMs)));
      return ffmpeg.detectSilence(store.resolveAssetPath(asset, opened.dir), threshold, minMs, asset.durationMs ?? 0);
    },
    'transcription:availability': () => transcription.availability(),
    'transcription:run': async (_e, projectId, assetId, language) => {
      const opened = await store.open(projectId);
      const asset = opened.project.assets.find((a) => a.id === assetId);
      if (!asset) throw new Error('Audio asset not found');
      return transcription.transcribe(store.resolveAssetPath(asset, opened.dir), language);
    },

    'export:chooseOutput': async (_e, name, ext) => {
      const r = await dialog.showSaveDialog(mainWindow!, {
        defaultPath: join(app.getPath('downloads'), `${name}.${ext}`),
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      });
      return r.canceled ? null : (r.filePath ?? null);
    },
    'export:start': (_e, req) => exporter.enqueue(req),
    'export:cancel': (_e, id) => exporter.cancel(id),
    'export:jobs': () => exporter.list(),
    'export:reveal': (_e, p) => shell.showItemInFolder(p),
    'export:renderJob': (_e, id) => exporter.renderJob(id),
    'export:frame': (_e, id, frame) => exporter.writeFrame(id, frame),
    'export:frameError': (_e, id, message) => exporter.frameError(id, message),
    'export:framesDone': (_e, id) => exporter.framesDone(id),

    'overlay:setIgnoreMouse': (e, ignore) => {
      BrowserWindow.fromWebContents(e.sender)?.setIgnoreMouseEvents(ignore, { forward: true });
    },
  });

  /* ---------------------------------------------------------------- shortcuts & menu */
  function registerShortcuts(): void {
    globalShortcut.unregisterAll();
    const { startStopRecording, pauseResumeRecording } = settings.get().shortcuts;
    const tryRegister = (accel: string, fn: () => void) => {
      try {
        if (!globalShortcut.register(accel, fn)) log.warn(`Shortcut ${accel} is taken by another app`);
      } catch (e) {
        log.warn(`Invalid shortcut ${accel}`, e);
      }
    };
    tryRegister(startStopRecording, () => {
      const phase = recorder.getState().phase;
      if (phase === 'recording' || phase === 'paused' || phase === 'countdown') void recorder.stop();
      else broadcast('shortcut:toggleRecording', undefined);
    });
    tryRegister(pauseResumeRecording, () => {
      const phase = recorder.getState().phase;
      if (phase === 'recording') void recorder.pause();
      else if (phase === 'paused') void recorder.resume();
    });
  }
  registerShortcuts();
  Menu.setApplicationMenu(buildMenu((cmd: MenuCommand) => send(mainWindow?.webContents, 'menu:command', cmd)));

  mainWindow = createMainWindow();
  mainWindow.on('closed', () => (mainWindow = null));
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (!mainWindow && app.isReady()) mainWindow = createMainWindow();
});
app.on('will-quit', () => globalShortcut.unregisterAll());
process.on('uncaughtException', (e) => log.error('Uncaught exception', e));
process.on('unhandledRejection', (e) => log.error('Unhandled rejection', e));

app.whenReady().then(bootstrap).catch((e) => {
  log.error('Fatal startup error', e);
  dialog.showErrorBox('Framecast failed to start', e instanceof Error ? e.message : String(e));
  app.quit();
});
