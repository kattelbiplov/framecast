import { z } from 'zod';
import { Color, Id, Ms } from './primitives.js';

export const SubtitleWord = z.object({
  text: z.string(),
  start: Ms,
  end: Ms,
  /** Recogniser confidence 0..1 when available. */
  confidence: z.number().min(0).max(1).optional(),
});
export type SubtitleWord = z.infer<typeof SubtitleWord>;

export const SubtitleCue = z.object({
  id: Id,
  start: Ms,
  end: Ms,
  text: z.string(),
  /** Word-level timing; empty when only cue-level timing is known. */
  words: z.array(SubtitleWord).default([]),
  speaker: z.string().optional(),
});
export type SubtitleCue = z.infer<typeof SubtitleCue>;

export const CaptionPresetId = z.enum([
  'classic',
  'wordHighlight',
  'karaoke',
  'pop',
  'bounce',
  'typewriter',
  'cinematic',
  'social',
  'minimal',
  'custom',
]);
export type CaptionPresetId = z.infer<typeof CaptionPresetId>;

export const CaptionStyle = z.object({
  preset: CaptionPresetId.default('classic'),
  fontFamily: z.string().default('Inter'),
  fontSizePx: z.number().positive().default(48),
  fontWeight: z.number().int().min(100).max(900).default(700),
  textColor: Color.default('#ffffff'),
  activeWordColor: Color.default('#facc15'),
  backgroundColor: Color.nullable().default('rgba(0,0,0,0.6)'),
  stroke: z.object({ color: Color, widthPx: z.number().positive() }).nullable().default(null),
  shadow: z.boolean().default(true),
  /** Vertical position of the caption block centre (0 top .. 1 bottom). */
  positionY: z.number().min(0).max(1).default(0.86),
  align: z.enum(['left', 'center', 'right']).default('center'),
  lineSpacing: z.number().positive().default(1.25),
  letterSpacingPx: z.number().default(0),
  uppercase: z.boolean().default(false),
  animationSpeed: z.number().positive().default(1),
  wordsPerLine: z.number().int().positive().default(7),
  maxLines: z.number().int().positive().max(4).default(2),
  /** Horizontal safe area inset as a fraction of canvas width. */
  safeAreaX: z.number().min(0).max(0.4).default(0.08),
});
export type CaptionStyle = z.infer<typeof CaptionStyle>;

export const SubtitleTrack = z.object({
  id: Id,
  language: z.string().default('en'),
  label: z.string().default('Subtitles'),
  visible: z.boolean().default(true),
  burnIn: z.boolean().default(true),
  style: CaptionStyle.default({}),
  cues: z.array(SubtitleCue).default([]),
  source: z.enum(['transcription', 'import', 'manual']).default('manual'),
});
export type SubtitleTrack = z.infer<typeof SubtitleTrack>;
