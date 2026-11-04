import { describe, expect, it } from 'vitest';
import { parseProbeOutput } from './ffmpeg.js';

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
