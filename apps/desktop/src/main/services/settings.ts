import { AppSettings } from '@framecast/schema';
import { atomicWriteJson, readJsonWithBackup } from '../lib/fs.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('settings');

type Listener = (settings: AppSettings) => void;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Recursive merge of plain objects; arrays and primitives are replaced. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = deepMerge((base as Record<string, unknown>)[k], v);
  return out as T;
}

export class SettingsService {
  private settings: AppSettings = AppSettings.parse({});
  private listeners = new Set<Listener>();

  constructor(private readonly file: string) {}

  async load(): Promise<AppSettings> {
    try {
      const { value } = await readJsonWithBackup(this.file);
      const parsed = AppSettings.safeParse(value);
      if (parsed.success) this.settings = parsed.data;
      else log.warn('Settings file invalid; using defaults', parsed.error.issues);
    } catch {
      log.info('No settings file yet; using defaults');
    }
    return this.settings;
  }

  get(): AppSettings {
    return this.settings;
  }

  async update(patch: unknown): Promise<AppSettings> {
    const next = AppSettings.parse(deepMerge(this.settings, patch));
    this.settings = next;
    await atomicWriteJson(this.file, next, { backup: true });
    for (const l of this.listeners) l(next);
    return next;
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
