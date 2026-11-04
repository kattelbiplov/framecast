import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FfmpegService, parseProbeOutput } from './ffmpeg.js';

describe('parseProbeOutput', () => {
  it('extracts duration, size and stream kinds', () => {
    const out = `Input #0, matroska,webm, from 'a.webm':
  Duration: 00:01:02.50, start: 0.000000, bitrate: N/A
  Stream #0:0(eng): Video: vp9 (Profile 0), yuv420p(tv), 2880x1800, SAR 1:1 DAR 8:5, 60 fps, 60 tbr, 1k tbn (default)
  Stream #0:1(eng): Audio: opus, 48000 Hz, stereo, fltp (default)`;
    expect(parseProbeOutput(out)).toEqual({ durationMs: 62500, width: 2880, height: 1800, fps: 60, hasVideo: true, hasAudio: true });
    expect(parseProbeOutput('Duration: N/A').durationMs).toBeNull();
  });
});

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasFfmpeg)('FfmpegService (integration)', () => {
  it('detects silence in real audio', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fc-sil-'));
    const file = join(dir, 'speech.wav');
    // 1 s tone, 1.5 s silence, 1 s tone
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=f=440:d=1', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono:d=1.5', '-f', 'lavfi', '-i', 'sine=f=440:d=1',
      '-filter_complex', '[0][1][2]concat=n=3:v=0:a=1', file]);
    const ff = new FfmpegService(() => null, '/nonexistent');
    const spans = await ff.detectSilence(file, -35, 500, 3500);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.start).toBeGreaterThan(950);
    expect(spans[0]!.end).toBeLessThan(2550);
    expect(spans[0]!.end - spans[0]!.start).toBeGreaterThan(1400);
  });
});
