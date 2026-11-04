import { BrowserWindow, nativeTheme, screen } from 'electron';
import { harden, loadRenderer, secureWebPreferences } from './load.js';

export function createMainWindow(): BrowserWindow {
  const { workAreaSize } = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    width: Math.min(1600, workAreaSize.width),
    height: Math.min(1000, workAreaSize.height),
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'Framecast',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0b0f' : '#f7f7f9',
    webPreferences: secureWebPreferences({
      // The Chromium recording engine runs MediaRecorder here; it must keep running when hidden.
      backgroundThrottling: false,
    }),
  });
  harden(win);
  win.once('ready-to-show', () => win.show());
  void loadRenderer(win, 'index');
  return win;
}
