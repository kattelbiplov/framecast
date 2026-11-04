import type { SubtitleCue } from '@framecast/schema';
import { segmentWords, wordsFromWhisperCpp, type WhisperCppJson } from '@framecast/subtitles';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TranscriptionAvailability } from '../../shared/ipc.js';
import { exists, readJson } from '../lib/fs.js';
import { createLogger } from '../lib/logger.js';
import type { FfmpegService } from './ffmpeg.js';

const log = createLogger('transcription');
const BINARY_NAMES = ['whisper-cli', 'whisper-cpp', 'main'];

/**
 * Offline speech-to-text via whisper.cpp. The binary and a ggml model are located from settings,
 * then `<userData>/whisper/` (bin + models). Audio is converted to 16 kHz mono WAV first.
 */
export class TranscriptionService {
  constructor(
    private readonly deps: {
      ffmpeg: FfmpegService;
      settings: () => { whisperBinaryPath: string | null; whisperModelPath: string | null };
      dataDir: string;
    },
  ) {}

  private async locate(): Promise<{ bin: string; model: string } | { error: string }> {
    const cfg = this.deps.settings();
    let bin = cfg.whisperBinaryPath && (await exists(cfg.whisperBinaryPath)) ? cfg.whisperBinaryPath : null;
    if (!bin) {
      for (const n of BINARY_NAMES) {
        const p = join(this.deps.dataDir, 'bin', n);
        if (await exists(p)) {
          bin = p;
          break;
        }
      }
    }
    if (!bin) {
      for (const n of BINARY_NAMES.slice(0, 2)) {
        if (await onPath(n)) {
          bin = n;
          break;
        }
      }
    }
    if (!bin) return { error: 'whisper.cpp was not found. Set its path in Settings → Transcription.' };
    let model = cfg.whisperModelPath && (await exists(cfg.whisperModelPath)) ? cfg.whisperModelPath : null;
    if (!model) {
      const dir = join(this.deps.dataDir, 'models');
      const files = (await exists(dir)) ? (await readdir(dir)).filter((f) => f.endsWith('.bin')).sort() : [];
      model = files[0] ? join(dir, files[0]) : null;
    }
    if (!model) return { error: 'No whisper model found. Download a ggml model (e.g. ggml-base.en.bin) and set it in Settings.' };
    return { bin, model };
  }

  async availability(): Promise<TranscriptionAvailability> {
    const r = await this.locate();
    return 'error' in r ? { available: false, reason: r.error } : { available: true };
  }

  async transcribe(mediaPath: string, language: string, signal?: AbortSignal): Promise<SubtitleCue[]> {
    const loc = await this.locate();
    if ('error' in loc) throw new Error(loc.error);
    const work = await mkdtemp(join(tmpdir(), 'framecast-stt-'));
    try {
      const wav = join(work, 'audio.wav');
      await this.deps.ffmpeg.run(['-hide_banner', '-y', '-i', mediaPath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], signal);
      const outBase = join(work, 'out');
      const args = ['-m', loc.model, '-f', wav, '-l', language || 'auto', '-ojf', '-of', outBase, '-pp'];
      log.info('Running whisper.cpp', { bin: loc.bin, language });
      await new Promise<void>((resolve, reject) => {
        const p = spawn(loc.bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let err = '';
        p.stderr.on('data', (d: Buffer) => (err = (err + d.toString()).slice(-3000)));
        signal?.addEventListener('abort', () => p.kill('SIGKILL'), { once: true });
        p.on('error', reject);
        p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`whisper.cpp failed (${code}): ${err.trim()}`))));
      });
      const json = await readJson<WhisperCppJson>(`${outBase}.json`);
      return segmentWords(wordsFromWhisperCpp(json));
    } finally {
      await rm(work, { recursive: true, force: true }); // never leave audio copies in tmp
    }
  }
}

function onPath(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(bin, ['--help'], { stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('exit', () => resolve(true));
  });
}
