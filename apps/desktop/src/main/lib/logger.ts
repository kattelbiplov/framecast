import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

type Level = 'debug' | 'info' | 'warn' | 'error';

let logFile: string | null = null;
let queue: Promise<void> = Promise.resolve();

export function configureLogFile(path: string): void {
  logFile = path;
}

function write(level: Level, scope: string, message: string, extra?: unknown): void {
  const line = `${new Date().toISOString()} [${level}] ${scope}: ${message}${extra !== undefined ? ` ${formatExtra(extra)}` : ''}`;
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
  if (!logFile) return;
  const file = logFile;
  queue = queue
    .then(() => mkdir(dirname(file), { recursive: true }))
    .then(() => appendFile(file, `${line}\n`))
    .catch(() => undefined);
}

function formatExtra(extra: unknown): string {
  if (extra instanceof Error) return extra.stack ?? extra.message;
  try {
    return JSON.stringify(extra);
  } catch {
    return String(extra);
  }
}

export interface Logger {
  debug(msg: string, extra?: unknown): void;
  info(msg: string, extra?: unknown): void;
  warn(msg: string, extra?: unknown): void;
  error(msg: string, extra?: unknown): void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (m, e) => write('debug', scope, m, e),
    info: (m, e) => write('info', scope, m, e),
    warn: (m, e) => write('warn', scope, m, e),
    error: (m, e) => write('error', scope, m, e),
  };
}
