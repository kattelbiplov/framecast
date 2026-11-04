import { describe, expect, it } from 'vitest';
import { ProjectFormatError, createProject, migrateProject } from './index.js';

describe('project schema', () => {
  it('creates a valid default project that round-trips through JSON', () => {
    const p = createProject('Demo', new Date('2026-01-01T00:00:00Z'));
    expect(p.timeline.tracks.map((t) => t.kind)).toContain('zoom');
    const restored = migrateProject(JSON.parse(JSON.stringify(p)));
    expect(restored).toEqual(p);
  });

  it('migrates v0 documents', () => {
    const p = createProject('Old');
    const { timeline, ...rest } = p;
    const v0 = { ...rest, schemaVersion: undefined, tracks: timeline.tracks };
    expect(migrateProject(v0).timeline.tracks).toHaveLength(timeline.tracks.length);
  });

  it('refuses newer formats and reports validation issues', () => {
    expect(() => migrateProject({ schemaVersion: 99 })).toThrow(/newer version/);
    try {
      migrateProject({ schemaVersion: 1, name: '' });
    } catch (e) {
      expect(e).toBeInstanceOf(ProjectFormatError);
      expect((e as ProjectFormatError).issues.length).toBeGreaterThan(0);
    }
  });
});
