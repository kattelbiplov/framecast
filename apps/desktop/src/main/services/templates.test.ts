import { createProject } from '@framecast/schema';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TemplateStore } from './templates.js';

describe('TemplateStore', () => {
  it('saves, lists and removes templates; rejects path tricks', async () => {
    const store = new TemplateStore(join(mkdtempSync(join(tmpdir(), 'fc-tpl-')), 'templates'));
    const tpl = await store.save('Brand', createProject('p'));
    expect((await store.list()).map((t) => t.name)).toEqual(['Brand']);
    await expect(store.remove('../../etc/passwd')).rejects.toThrow(/Invalid/);
    await store.remove(tpl.id);
    expect(await store.list()).toEqual([]);
  });
});
