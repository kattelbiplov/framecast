import { BrowserWindow } from 'electron';
import { harden, loadRenderer, secureWebPreferences } from './load.js';

/** Hidden renderer that draws export frames with the shared compositor. */
export function createExportWindow(jobId: string): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    width: 640,
    height: 360,
    webPreferences: secureWebPreferences({ backgroundThrottling: false, offscreen: false }),
  });
  harden(win);
  win.webContents.setAudioMuted(true);
  void loadRenderer(win, 'index', `/export/${jobId}`);
  return win;
}
