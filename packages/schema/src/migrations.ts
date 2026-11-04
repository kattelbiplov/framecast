import { PROJECT_SCHEMA_VERSION, Project } from './project.js';

export class ProjectFormatError extends Error {
  constructor(
    message: string,
    readonly issues: readonly string[] = [],
  ) {
    super(message);
    this.name = 'ProjectFormatError';
  }
}

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migrations keyed by the version they upgrade *from*. Add an entry here whenever
 * PROJECT_SCHEMA_VERSION is bumped; never edit an existing migration.
 */
const MIGRATIONS: Record<number, Migration> = {
  // 0 → 1: pre-release prototypes stored `tracks` at the top level.
  0: (raw) => {
    const { tracks, ...rest } = raw;
    return { ...rest, schemaVersion: 1, timeline: { tracks: tracks ?? [], markers: [] } };
  },
};

/** Upgrade an unknown JSON document to the current Project schema and validate it. */
export function migrateProject(input: unknown): Project {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ProjectFormatError('Project file is not a JSON object');
  }
  let doc = input as Record<string, unknown>;
  let version = typeof doc.schemaVersion === 'number' ? doc.schemaVersion : 0;
  if (version > PROJECT_SCHEMA_VERSION) {
    throw new ProjectFormatError(
      `Project was created by a newer version of Framecast (format v${version}). Please update the app.`,
    );
  }
  while (version < PROJECT_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) throw new ProjectFormatError(`No migration from project format v${version}`);
    doc = migrate(doc);
    version += 1;
  }
  const result = Project.safeParse(doc);
  if (!result.success) {
    throw new ProjectFormatError(
      'Project file is invalid',
      result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  }
  return result.data;
}
