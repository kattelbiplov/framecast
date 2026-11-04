import { newId, type SubtitleCue, type SubtitleWord } from '@framecast/schema';
import { distributeWords } from './whisper.js';

export interface SegmentOptions {
  maxWordsPerCue: number;
  maxCueMs: number;
  /** Silence longer than this always starts a new cue. */
  pauseBreakMs: number;
  minCueMs: number;
}

export const DEFAULT_SEGMENT_OPTIONS: SegmentOptions = {
  maxWordsPerCue: 14,
  maxCueMs: 6000,
  pauseBreakMs: 700,
  minCueMs: 700,
};

const SENTENCE_END = /[.!?…]["')\]]?$/;
const CLAUSE_END = /[,;:—–]$/;

/** Group timed words into readable cues, preferring sentence and clause boundaries. */
export function segmentWords(words: readonly SubtitleWord[], opts: Partial<SegmentOptions> = {}): SubtitleCue[] {
  const o = { ...DEFAULT_SEGMENT_OPTIONS, ...opts };
  const cues: SubtitleCue[] = [];
  let buf: SubtitleWord[] = [];
  const flush = () => {
    if (buf.length === 0) return;
    const start = buf[0]!.start;
    const end = Math.max(buf[buf.length - 1]!.end, start + o.minCueMs);
    cues.push({ id: newId('cue'), start, end, text: buf.map((w) => w.text).join(' '), words: buf });
    buf = [];
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const prev = buf[buf.length - 1];
    if (prev && w.start - prev.end > o.pauseBreakMs) flush();
    if (buf.length > 0 && w.end - buf[0]!.start > o.maxCueMs) flush();
    buf.push(w);
    const nearFull = buf.length >= o.maxWordsPerCue * 0.6;
    if (SENTENCE_END.test(w.text) || buf.length >= o.maxWordsPerCue || (nearFull && CLAUSE_END.test(w.text))) flush();
  }
  flush();
  // Prevent overlaps created by minCueMs padding.
  for (let i = 0; i < cues.length - 1; i++) {
    const a = cues[i]!;
    const b = cues[i + 1]!;
    if (a.end > b.start) a.end = b.start;
  }
  return cues;
}

/** Replace a cue's text, re-timing words: keeps word timings when the word count matches. */
export function editCueText(cue: SubtitleCue, text: string): SubtitleCue {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  const words =
    parts.length === cue.words.length
      ? cue.words.map((w, i) => ({ ...w, text: parts[i]! }))
      : distributeWords(text, cue.start, cue.end);
  return { ...cue, text: text.trim(), words };
}

/** Shift all cues by `deltaMs` (sync adjustment), clamping at zero. */
export function shiftCues(cues: readonly SubtitleCue[], deltaMs: number): SubtitleCue[] {
  const s = (v: number) => Math.max(0, v + deltaMs);
  return cues.map((c) => ({ ...c, start: s(c.start), end: s(c.end), words: c.words.map((w) => ({ ...w, start: s(w.start), end: s(w.end) })) }));
}

export function splitCue(cue: SubtitleCue, atWordIndex: number): [SubtitleCue, SubtitleCue] {
  const words = cue.words.length ? cue.words : distributeWords(cue.text, cue.start, cue.end);
  const i = Math.min(Math.max(1, atWordIndex), words.length - 1);
  const a = words.slice(0, i);
  const b = words.slice(i);
  return [
    { ...cue, end: a[a.length - 1]!.end, text: a.map((w) => w.text).join(' '), words: a },
    { ...cue, id: newId('cue'), start: b[0]!.start, text: b.map((w) => w.text).join(' '), words: b },
  ];
}

export function mergeCues(a: SubtitleCue, b: SubtitleCue): SubtitleCue {
  return { ...a, end: Math.max(a.end, b.end), text: `${a.text} ${b.text}`, words: [...a.words, ...b.words] };
}
