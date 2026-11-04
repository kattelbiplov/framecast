import { z } from 'zod';

export const ExportFormat = z.enum(['mp4', 'mov', 'webm', 'gif', 'audio']);
export type ExportFormat = z.infer<typeof ExportFormat>;

export const ExportQuality = z.enum(['draft', 'standard', 'high', 'lossless']);
export type ExportQuality = z.infer<typeof ExportQuality>;

export const ExportSettings = z.object({
  format: ExportFormat.default('mp4'),
  /** Output height in pixels; width follows the project aspect ratio. */
  height: z.number().int().positive().default(1080),
  fps: z.number().positive().max(120).default(60),
  quality: ExportQuality.default('high'),
  videoCodec: z.enum(['h264', 'hevc', 'prores', 'vp9', 'gif']).default('h264'),
  audioCodec: z.enum(['aac', 'opus', 'mp3', 'none']).default('aac'),
  /** Explicit bitrate override in kbps; null = derived from quality. */
  videoBitrateKbps: z.number().positive().nullable().default(null),
  hardwareAcceleration: z.boolean().default(true),
  burnSubtitles: z.boolean().default(true),
  exportSubtitleFile: z.enum(['none', 'srt', 'vtt']).default('none'),
  transparentBackground: z.boolean().default(false),
  watermark: z
    .object({ text: z.string(), position: z.enum(['tl', 'tr', 'bl', 'br']) })
    .nullable()
    .default(null),
});
export type ExportSettings = z.infer<typeof ExportSettings>;
