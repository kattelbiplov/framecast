import { Project, ProjectTemplate, extractTemplate } from '@framecast/schema';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWriteJson, readJson } from '../lib/fs.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('templates');
const SAFE_ID = /^tpl_[a-z0-9]+$/i;

/** User templates: one validated JSON file per template in `<userData>/templates`. */
export class TemplateStore {
  constructor(private readonly dir: string) {}

  async list(): Promise<ProjectTemplate[]> {
    await mkdir(this.dir, { recursive: true });
    const out: ProjectTemplate[] = [];
    for (const f of await readdir(this.dir)) {
      if (!f.endsWith('.json')) continue;
      const parsed = ProjectTemplate.safeParse(await readJson(join(this.dir, f)).catch(() => null));
      if (parsed.success) out.push(parsed.data);
      else log.warn(`Skipping invalid template ${f}`);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async save(name: string, project: unknown): Promise<ProjectTemplate> {
    const tpl = extractTemplate(Project.parse(project), name);
    await atomicWriteJson(join(this.dir, `${tpl.id}.json`), tpl);
    return tpl;
  }

  async remove(id: string): Promise<void> {
    if (!SAFE_ID.test(id)) throw new Error('Invalid template id');
    await rm(join(this.dir, `${id}.json`), { force: true });
  }
}
