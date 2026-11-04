import { clamp, ease, lerp } from '@framecast/animation';
import type { CaptionPresetId, CaptionStyle, SubtitleCue, SubtitleTrack, SubtitleWord } from '@framecast/schema';
import { distributeWords } from './whisper.js';

export interface CaptionWordState {
  text: string;
  state: 'past' | 'active' | 'future';
  /** Karaoke fill 0..1 across the word. */
  fill: number;
  opacity: number;
  scale: number;
  /** Vertical offset in em units. */
  dy: number;
  /** Number of characters visible (typewriter); Infinity = all. */
  visibleChars: number;
  highlighted: boolean;
}

export interface CaptionFrame {
  cueId: string;
  lines: CaptionWordState[][];
  opacity: number;
  scale: number;
  dy: number;
}

export interface CaptionPresetInfo {
  id: CaptionPresetId;
  name: string;
  description: string;
  defaults: Partial<CaptionStyle>;
}

export const CAPTION_PRESETS: readonly CaptionPresetInfo[] = [
  { id: 'classic', name: 'Classic', description: 'Simple subtitles on a soft background.', defaults: { backgroundColor: 'rgba(0,0,0,0.6)', fontSizePx: 44, fontWeight: 600, wordsPerLine: 8, maxLines: 2 } },
  { id: 'wordHighlight', name: 'Word highlight', description: 'The spoken word changes colour.', defaults: { backgroundColor: 'rgba(0,0,0,0.55)', activeWordColor: '#facc15', fontWeight: 700 } },
  { id: 'karaoke', name: 'Karaoke', description: 'Words fill progressively with speech.', defaults: { backgroundColor: null, stroke: { color: '#000000', widthPx: 6 }, activeWordColor: '#22d3ee' } },
  { id: 'pop', name: 'Pop', description: 'Each word pops in as it is spoken.', defaults: { backgroundColor: null, stroke: { color: '#000000', widthPx: 6 }, fontWeight: 800, wordsPerLine: 5 } },
  { id: 'bounce', name: 'Bounce', description: 'Words bounce as they are spoken.', defaults: { backgroundColor: null, stroke: { color: '#000000', widthPx: 6 }, fontWeight: 800, wordsPerLine: 5 } },
  { id: 'typewriter', name: 'Typewriter', description: 'Characters appear progressively.', defaults: { backgroundColor: 'rgba(0,0,0,0.7)', fontFamily: 'JetBrains Mono', fontWeight: 500 } },
  { id: 'cinematic', name: 'Cinematic', description: 'Large type with smooth fade and scale.', defaults: { backgroundColor: null, fontSizePx: 64, fontWeight: 300, letterSpacingPx: 2, shadow: true, wordsPerLine: 6, maxLines: 1 } },
  { id: 'social', name: 'Social', description: 'Bold, punchy short-form captions.', defaults: { backgroundColor: null, fontSizePx: 72, fontWeight: 900, uppercase: true, stroke: { color: '#000000', widthPx: 10 }, activeWordColor: '#a3e635', wordsPerLine: 3, maxLines: 1, positionY: 0.7 } },
  { id: 'minimal', name: 'Minimal', description: 'Small, clean subtitles with subtle fades.', defaults: { backgroundColor: null, fontSizePx: 34, fontWeight: 500, shadow: true, wordsPerLine: 10 } },
  { id: 'custom', name: 'Custom', description: 'Start from your own style.', defaults: {} },
];

/** Style for a preset: the preset's defaults layered over the user's current style. */
export function applyCaptionPreset(style: CaptionStyle, preset: CaptionPresetId): CaptionStyle {
  const info = CAPTION_PRESETS.find((p) => p.id === preset);
  return { ...style, ...(info?.defaults ?? {}), preset };
}

export function findCueAt(cues: readonly SubtitleCue[], t: number): SubtitleCue | null {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid]!;
    if (t < c.start) hi = mid - 1;
    else if (t >= c.end) lo = mid + 1;
    else return c;
  }
  return null;
}

const wordsOf = (cue: SubtitleCue): SubtitleWord[] =>
  cue.words.length > 0 ? cue.words : distributeWords(cue.text, cue.start, cue.end);

/**
 * Evaluate the caption to draw at time t. Long cues are paged so that at most
 * wordsPerLine × maxLines words are on screen, always including the active word.
 */
export function evaluateCaption(track: SubtitleTrack, t: number): CaptionFrame | null {
  if (!track.visible) return null;
  const cue = findCueAt(track.cues, t);
  if (!cue) return null;
  const style = track.style;
  const speed = style.animationSpeed;
  const all = wordsOf(cue);
  const pageSize = style.wordsPerLine * style.maxLines;
  let activeIdx = all.findIndex((w) => t >= w.start && t < w.end);
  if (activeIdx < 0) activeIdx = all.reduce((acc, w, i) => (w.start <= t ? i : acc), 0);
  const pageStart = Math.floor(activeIdx / pageSize) * pageSize;
  const page = all.slice(pageStart, pageStart + pageSize);
  const pageStartT = page[0]?.start ?? cue.start;

  const states = page.map((w): CaptionWordState => {
    const state = t >= w.end ? 'past' : t >= w.start ? 'active' : 'future';
    const fill = clamp((t - w.start) / Math.max(1, w.end - w.start));
    const since = (t - w.start) * speed;
    const base: CaptionWordState = {
      text: style.uppercase ? w.text.toUpperCase() : w.text,
      state, fill, opacity: 1, scale: 1, dy: 0, visibleChars: Number.POSITIVE_INFINITY, highlighted: false,
    };
    switch (style.preset) {
      case 'wordHighlight':
      case 'social':
        return { ...base, highlighted: state === 'active', scale: state === 'active' && style.preset === 'social' ? 1.08 : 1 };
      case 'karaoke':
        return { ...base, highlighted: state !== 'future' };
      case 'pop': {
        const p = clamp(since / 220);
        return { ...base, opacity: state === 'future' ? 0 : clamp(p * 3), scale: state === 'future' ? 0.4 : lerp(0.4, 1, ease('easeOutBack', p)), highlighted: state === 'active' };
      }
      case 'bounce': {
        const p = clamp(since / 380);
        return { ...base, opacity: state === 'future' ? 0.35 : 1, dy: state === 'future' ? 0 : -0.35 * Math.sin(Math.PI * p) * (1 - p * 0.4), highlighted: state === 'active' };
      }
      case 'typewriter': {
        if (state === 'future') return { ...base, visibleChars: 0 };
        const chars = Math.ceil(clamp(since / Math.max(1, w.end - w.start)) * w.text.length);
        return { ...base, visibleChars: state === 'past' ? Number.POSITIVE_INFINITY : Math.max(1, chars) };
      }
      case 'cinematic':
      case 'minimal':
      case 'classic':
      case 'custom':
      default:
        return base;
    }
  });

  const lines: CaptionWordState[][] = [];
  for (let i = 0; i < states.length; i += style.wordsPerLine) lines.push(states.slice(i, i + style.wordsPerLine));

  // Block-level fade/scale.
  const fadeMs = style.preset === 'cinematic' ? 350 : style.preset === 'minimal' ? 200 : 120;
  const fadeIn = clamp(((t - pageStartT) * speed) / fadeMs);
  const fadeOut = pageStart + pageSize >= all.length ? clamp(((cue.end - t) * speed) / fadeMs) : 1;
  const opacity = ease('easeOut', Math.min(fadeIn, fadeOut));
  const scale = style.preset === 'cinematic' ? lerp(0.96, 1, ease('easeOutCubic', fadeIn)) : 1;
  const dy = style.preset === 'minimal' ? (1 - ease('easeOutCubic', fadeIn)) * 0.15 : 0;
  return { cueId: cue.id, lines, opacity, scale, dy };
}
