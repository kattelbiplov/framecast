import { app } from 'electron';
import { join } from 'node:path';

export const paths = {
  userData: () => app.getPath('userData'),
  settingsFile: () => join(app.getPath('userData'), 'settings.json'),
  libraryIndex: () => join(app.getPath('userData'), 'library.json'),
  logFile: () => join(app.getPath('logs'), 'framecast.log'),
  defaultLibraryDir: () => join(app.getPath('videos'), 'Framecast'),
  /** In-progress recording sessions live here until finalized into a project. */
  sessionsDir: () => join(app.getPath('userData'), 'sessions'),
  /** Bundled native helpers (ScreenCaptureKit service, ffmpeg if bundled). */
  resourcesBin: () => (app.isPackaged ? join(process.resourcesPath, 'bin') : join(app.getAppPath(), 'resources', 'bin')),
};
