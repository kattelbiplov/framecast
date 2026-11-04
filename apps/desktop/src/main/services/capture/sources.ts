import { desktopCapturer, screen } from 'electron';
import type { CaptureSourceInfo } from '../../../shared/ipc.js';

/** Enumerate displays and windows via Chromium's desktopCapturer (works with or without the native helper). */
const cache = new Map<string, CaptureSourceInfo>();

/** Last-listed source by id (the renderer only ever sends ids back). */
export function getCachedSource(id: string): CaptureSourceInfo | undefined {
  return cache.get(id);
}

export async function listCaptureSources(): Promise<CaptureSourceInfo[]> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 480, height: 300 },
    fetchWindowIcons: false,
  });
  const displays = screen.getAllDisplays();
  const list = sources
    .filter((s) => !/^Framecast/.test(s.name))
    .map((s): CaptureSourceInfo => {
      const isScreen = s.id.startsWith('screen:');
      const display = isScreen ? displays.find((d) => String(d.id) === s.display_id) ?? displays[0] : undefined;
      return {
        id: s.id,
        kind: isScreen ? 'display' : 'window',
        name: isScreen && display ? `${s.name} (${display.size.width}×${display.size.height})` : s.name,
        displayId: s.display_id || undefined,
        thumbnailDataUrl: s.thumbnail.isEmpty() ? undefined : s.thumbnail.toDataURL(),
        bounds: display?.bounds,
      };
    });
  cache.clear();
  for (const s of list) cache.set(s.id, s);
  return list;
}
