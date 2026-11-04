import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { atomicWriteJson, isInside, readJsonWithBackup, safeFileName } from './fs.js';

describe('fs helpers', () => {
  it('writes atomically with backup and recovers from corruption', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fc-'));
    const file = join(dir, 'p.json');
    await atomicWriteJson(file, { v: 1 }, { backup: true });
    await atomicWriteJson(file, { v: 2 }, { backup: true });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ v: 2 });
    await writeFile(file, '{ corrupt');
    expect(await readJsonWithBackup(file)).toEqual({ value: { v: 1 }, fromBackup: true });
  });

  it('guards paths and sanitizes names', () => {
    expect(isInside('/a/b', '/a/b/c/d')).toBe(true);
    expect(isInside('/a/b', '/a/b/../c')).toBe(false);
    expect(safeFileName('../../etc/passwd')).toBe('....etcpasswd');
    expect(safeFileName('   ')).toBe('Untitled');
  });
});
