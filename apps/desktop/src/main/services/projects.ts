import {
  PROJECT_FILE_NAME,
  Project,
  RecordingMetadata,
  createProject,
  migrateProject,
  newId,
  type Asset,
} from '@framecast/schema';
import { timelineDuration } from '@framecast/timeline';
import { readdir } from 'node:fs/promises';
import { basename, extname, isAbsolute, join } from 'node:path';
import type { LibraryEntry, OpenedProject } from '../../shared/ipc.js';
import { atomicWrite, atomicWriteJson, exists, isInside, readJson, readJsonWithBackup, safeFileName } from '../lib/fs.js';
import { createLogger } from '../lib/logger.js';
import type { FfmpegService } from './ffmpeg.js';
import type { MediaProtocol } from './media-protocol.js';

const log = createLogger('projects');

interface LibraryIndex {
  version: 1;
  projects: LibraryEntry[];
}

const MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
};

export const mimeFor = (file: string) => MIME_BY_EXT[extname(file).toLowerCase()] ?? 'application/octet-stream';

/**
 * Persistence for projects. Each project is a self-contained directory:
 *
 *   <Library>/<Name>-<id>.framecast/
 *     project.framecast.json      (manifest, atomically written with .bak)
 *     recordings/<recId>/         (original media, never modified + metadata.json)
 *     thumbnail.png
 *
 * A small library index (JSON) caches listing data so the home screen loads instantly; it is
 * rebuilt from disk if missing. See docs/DECISIONS.md for why this is JSON rather than SQLite.
 */
export class ProjectStore {
  private index: LibraryIndex = { version: 1, projects: [] };
  private openDirs = new Map<string, string>();

  constructor(
    private readonly indexFile: string,
    private readonly libraryDir: () => string,
    private readonly media: MediaProtocol,
    private readonly ffmpeg: FfmpegService,
  ) {}

  async init(): Promise<void> {
    this.media.allowRoot(this.libraryDir());
    try {
      this.index = (await readJsonWithBackup<LibraryIndex>(this.indexFile)).value;
    } catch {
      await this.rebuildIndex();
    }
  }

  /** Scan the library directory for project folders (used when the index is missing). */
  async rebuildIndex(): Promise<void> {
    const dir = this.libraryDir();
    const entries: LibraryEntry[] = [];
    if (await exists(dir)) {
      for (const name of await readdir(dir)) {
        if (!name.endsWith('.framecast')) continue;
        try {
          const project = migrateProject(await readJson(join(dir, name, PROJECT_FILE_NAME)));
          entries.push(await this.entryFor(project, join(dir, name)));
        } catch (e) {
          log.warn(`Skipping unreadable project ${name}`, e);
        }
      }
    }
    this.index = { version: 1, projects: entries };
    await this.persistIndex();
  }

  list(): LibraryEntry[] {
    return [...this.index.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  dirOf(projectId: string): string {
    const dir = this.openDirs.get(projectId) ?? this.index.projects.find((p) => p.id === projectId)?.dir;
    if (!dir) throw new Error(`Unknown project ${projectId}`);
    return dir;
  }

  async create(name: string, prepare?: (project: Project, dir: string) => Promise<Project>): Promise<OpenedProject> {
    let project = createProject(name);
    const dir = join(this.libraryDir(), `${safeFileName(name)}-${project.id.slice(-6)}.framecast`);
    if (prepare) project = await prepare(project, dir);
    await this.write(project, dir);
    return this.open(project.id, dir);
  }

  async open(projectId: string, dirHint?: string): Promise<OpenedProject> {
    const dir = dirHint ?? this.dirOf(projectId);
    return this.openDir(dir);
  }

  async openDir(dir: string): Promise<OpenedProject> {
    const file = join(dir, PROJECT_FILE_NAME);
    const { value, fromBackup } = await readJsonWithBackup(file);
    if (fromBackup) log.warn(`Project at ${dir} was corrupt; restored from backup`);
    const project = migrateProject(value);
    this.openDirs.set(project.id, dir);
    this.media.allowRoot(dir);
    if (!this.index.projects.some((p) => p.id === project.id)) await this.upsertEntry(project, dir);

    const recordings: RecordingMetadata[] = [];
    for (const ref of project.recordings) {
      try {
        recordings.push(RecordingMetadata.parse(await readJson(join(dir, ref.metadataPath))));
      } catch (e) {
        log.warn(`Recording metadata ${ref.id} unreadable; cursor/zoom data unavailable`, e);
      }
    }
    const mediaUrls: Record<string, string> = {};
    for (const asset of project.assets) {
      const abs = this.resolveAssetPath(asset, dir);
      if (isAbsolute(asset.path)) this.media.allowFile(abs);
      mediaUrls[asset.id] = this.media.urlFor(abs);
    }
    return { project, dir, recordings, mediaUrls };
  }

  resolveAssetPath(asset: Pick<Asset, 'path'>, dir: string): string {
    return isAbsolute(asset.path) ? asset.path : join(dir, asset.path);
  }

  async save(input: unknown): Promise<{ updatedAt: string }> {
    const parsed = Project.parse(input); // never trust renderer data
    const dir = this.dirOf(parsed.id);
    const project = { ...parsed, updatedAt: new Date().toISOString() };
    await this.write(project, dir);
    return { updatedAt: project.updatedAt };
  }

  async rename(projectId: string, name: string): Promise<void> {
    const opened = await this.open(projectId);
    await this.write({ ...opened.project, name, updatedAt: new Date().toISOString() }, opened.dir);
  }

  async remove(projectId: string, trash: (path: string) => Promise<void>): Promise<void> {
    const dir = this.dirOf(projectId);
    if (!isInside(this.libraryDir(), dir)) throw new Error('Refusing to delete a project outside the library');
    await trash(dir);
    this.index.projects = this.index.projects.filter((p) => p.id !== projectId);
    this.openDirs.delete(projectId);
    await this.persistIndex();
  }

  /** Link external media files into a project (non-destructive: files are referenced, not copied). */
  async importMedia(files: string[]): Promise<{ assets: Asset[]; mediaUrls: Record<string, string> }> {
    const assets: Asset[] = [];
    const mediaUrls: Record<string, string> = {};
    for (const file of files) {
      const mimeType = mimeFor(file);
      const isImage = mimeType.startsWith('image/');
      const probe = isImage ? null : await this.ffmpeg.probe(file).catch(() => null);
      const asset: Asset = {
        id: newId('ast'),
        role: isImage ? 'image' : probe?.hasVideo ? 'video' : 'audio',
        name: basename(file),
        path: file,
        mimeType,
        durationMs: probe?.durationMs ?? undefined,
        size: probe?.width && probe.height ? { width: probe.width, height: probe.height } : undefined,
        hasAudio: probe?.hasAudio ?? false,
      };
      this.media.allowFile(file);
      mediaUrls[asset.id] = this.media.urlFor(file);
      assets.push(asset);
    }
    return { assets, mediaUrls };
  }

  async saveThumbnail(projectId: string, png: Uint8Array): Promise<void> {
    const dir = this.dirOf(projectId);
    const path = join(dir, 'thumbnail.png');
    await atomicWrite(path, png);
    const entry = this.index.projects.find((p) => p.id === projectId);
    if (entry) {
      entry.thumbnailPath = path;
      await this.persistIndex();
    }
  }

  thumbnailUrl(entry: LibraryEntry): string | null {
    return entry.thumbnailPath ? this.media.urlFor(entry.thumbnailPath) : null;
  }

  private async write(project: Project, dir: string): Promise<void> {
    await atomicWriteJson(join(dir, PROJECT_FILE_NAME), project, { backup: true });
    this.openDirs.set(project.id, dir);
    await this.upsertEntry(project, dir);
  }

  private async entryFor(project: Project, dir: string): Promise<LibraryEntry> {
    const thumb = join(dir, 'thumbnail.png');
    return {
      id: project.id,
      name: project.name,
      dir,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      durationMs: timelineDuration(project.timeline),
      thumbnailPath: (await exists(thumb)) ? thumb : null,
    };
  }

  private async upsertEntry(project: Project, dir: string): Promise<void> {
    const entry = await this.entryFor(project, dir);
    this.index.projects = [...this.index.projects.filter((p) => p.id !== project.id), entry];
    await this.persistIndex();
  }

  private persistIndex(): Promise<void> {
    return atomicWriteJson(this.indexFile, this.index, { backup: true });
  }
}

