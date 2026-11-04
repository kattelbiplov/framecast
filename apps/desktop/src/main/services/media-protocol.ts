import { net, protocol } from 'electron';
import { pathToFileURL } from 'node:url';
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
      // net.fetch on file:// honours Range headers, which <video> seeking relies on.
      return net.fetch(pathToFileURL(file).toString(), { headers: request.headers, bypassCustomProtocolHandlers: true });
    });
  }
}
