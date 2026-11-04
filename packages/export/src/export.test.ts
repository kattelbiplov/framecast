import { ExportSettings, createProject } from '@framecast/schema';
import { addItem } from '@framecast/timeline';
import { describe, expect, it } from 'vitest';
import { JobQueue, atempoChain, buildAudioGraph, buildEncodeArgs, estimateFileSize, parseProgress, resolveVideoCodec } from './index.js';

const size = { width: 1920, height: 1080 };

describe('encoder args', () => {
  it('uses VideoToolbox only on macOS', () => {
    const s = ExportSettings.parse({});
    expect(buildEncodeArgs(s, { size, fps: 60, outputPath: 'o.mp4', platform: 'darwin' })).toContain('h264_videotoolbox');
    const linux = buildEncodeArgs(s, { size, fps: 60, outputPath: 'o.mp4', platform: 'linux' });
    expect(linux).toContain('libx264');
    expect(linux.slice(-1)[0]).toBe('o.mp4');
  });

  it('picks alpha-capable codecs for transparent exports', () => {
    expect(resolveVideoCodec(ExportSettings.parse({ format: 'mov', transparentBackground: true }))).toBe('prores');
    const args = buildEncodeArgs(ExportSettings.parse({ format: 'mov', transparentBackground: true }), { size, fps: 30, outputPath: 'o.mov', platform: 'darwin' });
    expect(args).toContain('yuva444p10le');
  });

  it('builds a palette pipeline for GIF', () => {
    const args = buildEncodeArgs(ExportSettings.parse({ format: 'gif', fps: 15 }), { size, fps: 15, outputPath: 'o.gif', platform: 'linux' });
    expect(args.join(' ')).toContain('palettegen');
    expect(args).toContain('-an');
  });

  it('parses progress and estimates sizes', () => {
    expect(parseProgress('frame=10\nout_time_us=1500000\n')).toBe(1500);
    const mp4 = estimateFileSize(ExportSettings.parse({}), size, 60_000);
    const prores = estimateFileSize(ExportSettings.parse({ format: 'mov', videoCodec: 'prores' }), size, 60_000);
    expect(prores).toBeGreaterThan(mp4 * 5);
  });
});

describe('audio graph', () => {
  it('chains atempo for extreme speeds', () => {
    expect(atempoChain(4)).toEqual(['atempo=2', 'atempo=2']);
    expect(atempoChain(0.25)).toEqual(['atempo=0.5', 'atempo=0.5']);
    expect(atempoChain(1)).toEqual([]);
  });

  it('mixes clips with delays, fades and ducking', () => {
    let p = createProject('a');
    p = {
      ...p,
      audio: { normalize: true, noiseReduction: false, duckingDb: 12 },
      assets: [
        { id: 'mic', role: 'microphone', name: 'mic', path: 'mic.webm', mimeType: 'audio/webm', hasAudio: true },
        { id: 'music', role: 'music', name: 'music', path: 'm.mp3', mimeType: 'audio/mpeg', hasAudio: true },
      ],
    };
    const [mic, , music] = p.timeline.tracks.filter((t) => t.kind === 'audio');
    const base = { type: 'clip' as const, sourceIn: 0, speed: 1, reverse: false, freezeFrame: false, volume: 1, muted: false, fadeInMs: 0, fadeOutMs: 0, transitionIn: null, crop: { top: 0, right: 0, bottom: 0, left: 0 }, color: { brightness: 1, contrast: 1, saturation: 1 }, keyframes: {} };
    let tl = addItem(p.timeline, mic!.id, { ...base, id: 'c1', assetId: 'mic', start: 500, duration: 4000 });
    tl = addItem(tl, music!.id, { ...base, id: 'c2', assetId: 'music', start: 0, duration: 5000, volume: 0.5, fadeOutMs: 1000 });
    const g = buildAudioGraph({ ...p, timeline: tl }, (a) => `/abs/${a.path}`, { totalDurationMs: 5000 })!;
    expect(g.inputs).toEqual(['/abs/mic.webm', '/abs/m.mp3']);
    expect(g.filterComplex).toContain('adelay=500:all=1');
    expect(g.filterComplex).toContain('sidechaincompress');
    expect(g.filterComplex).toContain('loudnorm');
    expect(g.filterComplex).toContain('afade=t=out:st=4.000:d=1.000');
    expect(buildAudioGraph(createProject('silent'), () => '', { totalDurationMs: 1 })).toBeNull();
  });
});

describe('job queue', () => {
  it('runs jobs sequentially and supports cancellation', async () => {
    const order: string[] = [];
    const q = new JobQueue<string>(async (p, ctx) => {
      order.push(p);
      ctx.progress(0.5);
      await new Promise((r) => setTimeout(r, 5));
      if (ctx.signal.aborted) throw new Error('aborted');
      return `${p}-done`;
    });
    q.enqueue('1', 'a');
    q.enqueue('2', 'b');
    q.enqueue('3', 'c');
    q.cancel('3');
    await new Promise((r) => setTimeout(r, 40));
    expect(order).toEqual(['a', 'b']);
    expect(q.list().map((j) => j.status)).toEqual(['done', 'done', 'cancelled']);
    expect(q.list()[0]!.result).toBe('a-done');
  });
});

describe('silence detection', () => {
  it('parses silencedetect output including a trailing open span', async () => {
    const { parseSilenceDetect } = await import('./index.js');
    const out = `[silencedetect @ 0x1] silence_start: 1.0023
[silencedetect @ 0x1] silence_end: 2.5 | silence_duration: 1.4977
[silencedetect @ 0x1] silence_start: 4.2`;
    expect(parseSilenceDetect(out, 5000)).toEqual([{ start: 1002, end: 2500 }, { start: 4200, end: 5000 }]);
  });

  it('plans padded cuts in timeline time, latest first, skipping short pauses', async () => {
    const { planSilenceCuts } = await import('./index.js');
    const clip = { start: 10_000, duration: 10_000, sourceIn: 2000, speed: 2 };
    const cuts = planSilenceCuts([{ start: 4000, end: 6000 }, { start: 8000, end: 8500 }, { start: 20_000, end: 30_000 }], clip, { paddingMs: 100, minCutMs: 300 });
    // source 4100..5900 → timeline 11050..11950; 8000..8500 → too short after speed; last clipped to clip end
    expect(cuts).toEqual([{ start: 19_050, end: 20_000 }, { start: 11_050, end: 11_950 }]);
  });
});
