import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

/**
 * Write a file atomically: write to a temp file in the same directory, fsync, then rename.
 * Readers never observe a partially written file, even if the app crashes mid-write.
 */
export async function atomicWrite(path: string, data: string | Uint8Array, opts: { backup?: boolean } = {}): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID().slice(0, 8)}.tmp`;
  const handle = await open(tmp, 'w', 0o600);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  if (opts.backup && (await exists(path))) await copyFile(path, `${path}.bak`).catch(() => undefined);
  await rename(tmp, path);
}

export const atomicWriteJson = (path: string, value: unknown, opts?: { backup?: boolean }) =>
  atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`, opts);

export async function readJson<T = unknown>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

/** Read JSON, falling back to the `.bak` copy if the primary is missing or corrupt. */
export async function readJsonWithBackup<T = unknown>(path: string): Promise<{ value: T; fromBackup: boolean }> {
  try {
    return { value: await readJson<T>(path), fromBackup: false };
  } catch (primaryError) {
    try {
      return { value: await readJson<T>(`${path}.bak`), fromBackup: true };
    } catch {
      throw primaryError;
    }
  }
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function removeDir(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

/** True when `child` is `parent` or inside it (after resolving `..`). */
export function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** Make a string safe for use as a single path segment. */
export function safeFileName(name: string, fallback = 'Untitled'): string {
  // eslint-disable-next-line no-control-regex -- stripping control chars is the point
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return cleaned.length > 0 && cleaned !== '.' && cleaned !== '..' ? cleaned : fallback;
}
