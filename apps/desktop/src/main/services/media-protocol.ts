import { protocol } from 'electron';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { MEDIA_PROTOCOL } from '../../shared/ipc.js';
import { isInside } from '../lib/fs.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('media');

/**
 * Serves local media to the renderer via `framecast-media://file/<encoded path>`.
 * Only files inside registered roots (library, open projects, imported files) are served,
 * so a compromised renderer cannot read arbitrary files.
 */
export class MediaProtocol {
  private roots = new Set<string>();
  private files = new Set<string>();

  static registerScheme(): void {
    protocol.registerSchemesAsPrivileged([
      { scheme: MEDIA_PROTOCOL, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } },
    ]);
  }

  allowRoot(dir: string): void {
    this.roots.add(dir);
  }

  allowFile(file: string): void {
    this.files.add(file);
  }

  isAllowed(file: string): boolean {
    if (this.files.has(file)) return true;
    for (const root of this.roots) if (isInside(root, file)) return true;
    return false;
  }

  urlFor(absPath: string): string {
    return `${MEDIA_PROTOCOL}://file/${encodeURIComponent(absPath)}`;
  }

  handle(): void {
    protocol.handle(MEDIA_PROTOCOL, async (request) => {
      const url = new URL(request.url);
      const file = decodeURIComponent(url.pathname.replace(/^\//, ''));
      if (!this.isAllowed(file)) {
        log.warn('Blocked media request outside allowed roots', file);
        return new Response('Forbidden', { status: 403 });
      }
      return serveFile(file, request.headers.get('range'));
    });
  }
}

const MIME: Record<string, string> = {
  webm: 'video/webm', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska',
  m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', aac: 'audio/aac',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
};

/**
 * Parse a single-range `Range: bytes=…` header against a file size.
 * Returns null for no/unsupported header (serve whole file) and 'invalid' for unsatisfiable.
 */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null | 'invalid' {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start: number;
  let end: number;
  if (m[1] === '') {
    // suffix range: last N bytes
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}

/**
 * Serve a local file with HTTP Range support. <video> needs 206 responses to be seekable;
 * without them Chromium treats the media as a stream and ignores currentTime assignments.
 */
async function serveFile(file: string, rangeHeader: string | null): Promise<Response> {
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const type = MIME[file.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
  const range = parseRange(rangeHeader, size);
  if (range === 'invalid') {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const body = size === 0 ? null : (Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream);
  const headers: Record<string, string> = {
    'Content-Type': type,
    'Content-Length': String(size === 0 ? 0 : end - start + 1),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  };
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  return new Response(body, { status: range ? 206 : 200, headers });
}
