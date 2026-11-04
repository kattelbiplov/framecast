import type { BrowserWindow} from 'electron';
import { shell } from 'electron';
import { join } from 'node:path';

export type RendererEntry = 'index' | 'overlay';

/** Origin(s) our renderer is served from; IPC from anywhere else is rejected. */
export function rendererOrigins(): string[] {
  const dev = process.env['ELECTRON_RENDERER_URL'];
  return dev ? [new URL(dev).origin, 'file://'] : ['file://'];
}

export function loadRenderer(win: BrowserWindow, entry: RendererEntry, hash = ''): Promise<void> {
  const dev = process.env['ELECTRON_RENDERER_URL'];
  if (dev) return win.loadURL(`${dev}/${entry}.html${hash ? `#${hash}` : ''}`);
  return win.loadFile(join(__dirname, `../renderer/${entry}.html`), hash ? { hash } : undefined);
}

export const preloadPath = () => join(__dirname, '../preload/index.js');

/** Common hardening for every window. */
export function harden(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!rendererOrigins().some((o) => url.startsWith(o))) e.preventDefault();
  });
}

export const secureWebPreferences = (extra: Electron.WebPreferences = {}): Electron.WebPreferences => ({
  preload: preloadPath(),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webSecurity: true,
  spellcheck: false,
  ...extra,
});
