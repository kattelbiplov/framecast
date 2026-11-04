import type {
  AppSettings,
  ProjectTemplate,
  Asset,
  ExportSettings,
  Project,
  RecordingMetadata,
  SubtitleCue,
} from '@framecast/schema';

/* ------------------------------------------------------------------ domain DTOs */

export interface AppInfo {
  version: string;
  platform: string;
  arch: string;
  /** Whether the native ScreenCaptureKit helper is installed and usable. */
  nativeCapture: boolean;
  libraryDir: string;
}

export type PermissionKind = 'screen' | 'microphone' | 'camera' | 'accessibility';
export type PermissionState = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';
export type PermissionStatus = Record<PermissionKind, PermissionState>;

export interface CaptureSourceInfo {
  id: string;
  kind: 'display' | 'window';
  name: string;
  displayId?: string;
  appName?: string;
  thumbnailDataUrl?: string;
  bounds?: { x: number; y: number; width: number; height: number };
}

export interface RecordingOptions {
  sourceId: string | null;
  /** Normalized region of the display to record (region mode). */
  region: { x: number; y: number; width: number; height: number } | null;
  fps: 24 | 30 | 60;
  microphoneDeviceId: string | null;
  webcamDeviceId: string | null;
  systemAudio: boolean;
  countdownSec: number;
  trackInteractions: boolean;
  trackShortcuts: boolean;
  hideCursor: boolean;
  projectName?: string;
}

export type RecordingPhase = 'idle' | 'countdown' | 'recording' | 'paused' | 'finalizing' | 'error';

export interface RecordingState {
  phase: RecordingPhase;
  sessionId: string | null;
  engine: 'screencapturekit' | 'chromium' | null;
  /** Recorded duration excluding pauses (ms). */
  elapsedMs: number;
  countdownRemaining: number;
  error: string | null;
  /** Set once finalizing completes. */
  projectId: string | null;
}

export type StreamKind = 'screen' | 'webcam' | 'microphone' | 'systemAudio';

export interface LibraryEntry {
  id: string;
  name: string;
  dir: string;
  createdAt: string;
  updatedAt: string;
  durationMs: number;
  thumbnailPath: string | null;
}

export interface OpenedProject {
  project: Project;
  dir: string;
  recordings: RecordingMetadata[];
  /** Absolute media URLs for each asset, served via the media protocol. */
  mediaUrls: Record<string, string>;
}

export interface ExportJobRequest {
  projectId: string;
  settings: ExportSettings;
  outputPath: string;
  /** Range of the timeline to export (ms). */
  range: { start: number; end: number };
}

export interface ExportJobView {
  id: string;
  projectName: string;
  outputPath: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  progress: number;
  error?: string;
}

export interface ExportRenderJob {
  id: string;
  opened: OpenedProject;
  settings: ExportSettings;
  range: { start: number; end: number };
  size: { width: number; height: number };
  fps: number;
}

export interface RecoveryEntry {
  sessionId: string;
  dir: string;
  startedAt: string;
}

export interface TranscriptionAvailability {
  available: boolean;
  reason?: string;
}

export type MenuCommand =
  | 'new-recording'
  | 'open-project'
  | 'save'
  | 'export'
  | 'undo'
  | 'redo'
  | 'split'
  | 'delete'
  | 'duplicate'
  | 'toggle-play'
  | 'zoom-in-timeline'
  | 'zoom-out-timeline'
  | 'add-zoom'
  | 'preferences'
  | 'home';

/* ------------------------------------------------------------------ invoke channels */

export interface InvokeChannels {
  'app:info': () => AppInfo;
  'settings:get': () => AppSettings;
  'settings:update': (patch: Partial<AppSettings>) => AppSettings;
  'permissions:status': () => PermissionStatus;
  'permissions:request': (kind: PermissionKind) => PermissionState;
  'permissions:openSettings': (kind: PermissionKind) => void;

  'capture:sources': () => CaptureSourceInfo[];
  /** Select which source answers the renderer's next getDisplayMedia() call (Chromium engine). */
  'capture:prepareDisplay': (sourceId: string, systemAudio: boolean) => void;
  'recording:start': (opts: RecordingOptions) => RecordingState;
  'recording:pause': () => RecordingState;
  'recording:resume': () => RecordingState;
  'recording:stop': () => RecordingState;
  'recording:cancel': () => RecordingState;
  'recording:state': () => RecordingState;
  /** Renderer-side (chromium engine) recorders stream chunks to disk through this channel. */
  'recording:chunk': (sessionId: string, kind: StreamKind, mimeType: string, data: Uint8Array) => void;
  'recording:streamInfo': (sessionId: string, kind: StreamKind, info: { width?: number; height?: number; label?: string }) => void;
  /** Renderer signals all chromium-engine streams have flushed their final chunk. */
  'recording:streamsDone': (sessionId: string) => void;
  'recording:recoveries': () => RecoveryEntry[];
  'recording:recover': (sessionId: string) => string | null;
  'recording:discardRecovery': (sessionId: string) => void;

  'library:list': () => LibraryEntry[];
  'project:create': (name: string) => OpenedProject;
  'project:open': (projectId: string) => OpenedProject;
  'project:openDialog': () => OpenedProject | null;
  'project:save': (project: Project) => { updatedAt: string };
  'project:rename': (projectId: string, name: string) => void;
  'project:delete': (projectId: string) => void;
  'project:reveal': (projectId: string) => void;
  'project:importMedia': (projectId: string) => { assets: Asset[]; mediaUrls: Record<string, string> };
  'project:saveThumbnail': (projectId: string, png: Uint8Array) => void;

  'templates:list': () => ProjectTemplate[];
  'templates:save': (name: string, project: Project) => ProjectTemplate;
  'templates:delete': (id: string) => void;

  'subtitles:import': () => { name: string; cues: SubtitleCue[] } | null;
  'subtitles:export': (cues: SubtitleCue[], format: 'srt' | 'vtt', suggestedName: string) => string | null;
  /** Silent spans (source ms) in an asset's audio. */
  'audio:detectSilence': (projectId: string, assetId: string, opts: { thresholdDb: number; minSilenceMs: number }) => { start: number; end: number }[];
  'transcription:availability': () => TranscriptionAvailability;
  'transcription:run': (projectId: string, assetId: string, language: string) => SubtitleCue[];

  'export:chooseOutput': (suggestedName: string, extension: string) => string | null;
  'export:start': (req: ExportJobRequest) => string;
  'export:cancel': (jobId: string) => void;
  'export:jobs': () => ExportJobView[];
  'export:reveal': (path: string) => void;
  /** Called by the hidden export renderer. */
  'export:renderJob': (jobId: string) => ExportRenderJob;
  'export:frame': (jobId: string, frame: Uint8Array) => void;
  'export:frameError': (jobId: string, message: string) => void;
  'export:framesDone': (jobId: string) => void;

  'overlay:setIgnoreMouse': (ignore: boolean) => void;
}

/* ------------------------------------------------------------------ main → renderer events */

export interface EventChannels {
  'recording:state': RecordingState;
  'export:jobs': ExportJobView[];
  'menu:command': MenuCommand;
  'shortcut:toggleRecording': void;
}

export type InvokeChannel = keyof InvokeChannels;
export type EventChannel = keyof EventChannels;
export type InvokeArgs<C extends InvokeChannel> = Parameters<InvokeChannels[C]>;
export type InvokeResult<C extends InvokeChannel> = ReturnType<InvokeChannels[C]>;

/** Channels the preload bridge allows. Anything else is rejected. */
export const INVOKE_CHANNELS = [
  'app:info', 'settings:get', 'settings:update', 'permissions:status', 'permissions:request', 'permissions:openSettings',
  'capture:sources', 'capture:prepareDisplay', 'recording:start', 'recording:pause', 'recording:resume', 'recording:stop', 'recording:cancel',
  'recording:state', 'recording:chunk', 'recording:streamInfo', 'recording:streamsDone', 'recording:recoveries', 'recording:recover',
  'recording:discardRecovery', 'library:list', 'project:create', 'project:open', 'project:openDialog', 'project:save',
  'project:rename', 'project:delete', 'project:reveal', 'project:importMedia', 'project:saveThumbnail',
  'templates:list', 'templates:save', 'templates:delete',
  'subtitles:import', 'subtitles:export', 'audio:detectSilence', 'transcription:availability', 'transcription:run', 'export:chooseOutput',
  'export:start', 'export:cancel', 'export:jobs', 'export:reveal', 'export:renderJob', 'export:frame',
  'export:frameError', 'export:framesDone', 'overlay:setIgnoreMouse',
] as const satisfies readonly InvokeChannel[];

export const EVENT_CHANNELS = ['recording:state', 'export:jobs', 'menu:command', 'shortcut:toggleRecording'] as const satisfies readonly EventChannel[];

/** API exposed on `window.framecast` by the preload script. */
export interface FramecastBridge {
  invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<Awaited<InvokeResult<C>>>;
  on<C extends EventChannel>(channel: C, listener: (payload: EventChannels[C]) => void): () => void;
}

export const MEDIA_PROTOCOL = 'framecast-media';
