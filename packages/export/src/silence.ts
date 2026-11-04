import type { ClipItem } from '@framecast/schema';

export interface Span {
  start: number;
  end: number;
}

/** Parse ffmpeg `silencedetect` stderr into silent spans (ms). A trailing open span ends at `totalMs`. */
export function parseSilenceDetect(stderr: string, totalMs: number): Span[] {
  const spans: Span[] = [];
  let open: number | null = null;
  for (const line of stderr.split(/\r?\n/)) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (s) {
      open = Math.max(0, Number(s[1]) * 1000);
      continue;
    }
    const e = /silence_end:\s*([\d.]+)/.exec(line);
    if (e && open !== null) {
      spans.push({ start: open, end: Number(e[1]) * 1000 });
      open = null;
    }
  }
  if (open !== null && totalMs > open) spans.push({ start: open, end: totalMs });
  return spans.map((sp) => ({ start: Math.round(sp.start), end: Math.round(sp.end) }));
}

export interface SilenceCutOptions {
  /** Speech kept on each side of a pause so cuts don't clip words. */
  paddingMs: number;
  /** Pauses shorter than this (after padding) are left alone. */
  minCutMs: number;
}

export const DEFAULT_SILENCE_CUT: SilenceCutOptions = { paddingMs: 150, minCutMs: 300 };

/**
 * Convert silent spans in a clip's *source* media into timeline ranges to delete, latest first
 * (so applying them in order never shifts the ranges still to be applied).
 */
export function planSilenceCuts(silences: readonly Span[], clip: Pick<ClipItem, 'start' | 'duration' | 'sourceIn' | 'speed'>, opts: SilenceCutOptions = DEFAULT_SILENCE_CUT): Span[] {
  const clipEnd = clip.start + clip.duration;
  const toTimeline = (src: number) => clip.start + (src - clip.sourceIn) / clip.speed;
  const cuts: Span[] = [];
  for (const s of silences) {
    const start = Math.max(clip.start, toTimeline(s.start + opts.paddingMs));
    const end = Math.min(clipEnd, toTimeline(s.end - opts.paddingMs));
    if (end - start >= opts.minCutMs) cuts.push({ start: Math.round(start), end: Math.round(end) });
  }
  return cuts.sort((a, b) => b.start - a.start);
}
