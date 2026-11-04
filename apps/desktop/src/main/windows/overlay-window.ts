import { BrowserWindow, screen } from 'electron';
import { harden, loadRenderer, secureWebPreferences } from './load.js';

/**
 * Floating recording toolbar. `setContentProtection(true)` excludes it from screen capture on
 * macOS (NSWindowSharingNone) and Windows (WDA_EXCLUDEFROMCAPTURE), so it never appears in the
 * recording. The native helper additionally excludes the whole app via SCContentFilter.
 */
export function createOverlayWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 340;
  const height = 64;
  const win = new BrowserWindow({
    width,
    height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: workArea.y + workArea.height - height - 32,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    hasShadow: false,
    show: false,
    title: 'Framecast Recording Controls',
    webPreferences: secureWebPreferences(),
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setContentProtection(true);
  harden(win);
  void loadRenderer(win, 'overlay');
  return win;
}
