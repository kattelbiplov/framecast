import type { ExportSettings, Size } from '@framecast/schema';
import { resolveVideoCodec, targetBitrateKbps } from './encode.js';

/** Rough output size in bytes; shown as an estimate in the export dialog. */
export function estimateFileSize(settings: ExportSettings, size: Size, durationMs: number): number {
  const sec = durationMs / 1000;
  const audioKbps = settings.audioCodec === 'none' || settings.format === 'gif' ? 0 : settings.audioCodec === 'opus' ? 160 : 192;
  if (settings.format === 'audio') return (audioKbps * 1000 * sec) / 8;
  const codec = resolveVideoCodec(settings);
  let videoKbps = targetBitrateKbps(settings, size, settings.fps);
  if (codec === 'hevc') videoKbps *= 0.7;
  if (codec === 'vp9') videoKbps *= 0.8;
  if (codec === 'prores') videoKbps = (size.width * size.height * settings.fps * (settings.transparentBackground ? 4.5 : 2.9)) / 1000;
  if (codec === 'gif') videoKbps = (size.width * size.height * Math.min(settings.fps, 30) * 0.12) / 1000;
  // Screen recordings compress well: CRF encodes typically land ~60% of the ceiling.
  const efficiency = settings.hardwareAcceleration || codec === 'prores' || codec === 'gif' ? 1 : 0.6;
  return ((videoKbps * efficiency + audioKbps) * 1000 * sec) / 8;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}
