import type { ExportSettings, Size } from '@framecast/schema';

export interface EncodeTarget {
  size: Size;
  fps: number;
  outputPath: string;
  /** Platform the encoder runs on — VideoToolbox encoders exist only on macOS. */
  platform: string;
  /** Extra inputs (audio files) and filter graph from `buildAudioGraph`. */
  audio?: { inputs: string[]; filterComplex: string; outLabel: string } | null;
}

/** Video bitrate (kbps) for a quality preset scaled by pixel rate (1080p60 as reference). */
export function targetBitrateKbps(settings: ExportSettings, size: Size, fps: number): number {
  if (settings.videoBitrateKbps) return settings.videoBitrateKbps;
  const base = { draft: 4000, standard: 9000, high: 16000, lossless: 80000 }[settings.quality];
  const pixelRate = (size.width * size.height * fps) / (1920 * 1080 * 60);
  // Bitrate scales sub-linearly with pixel rate.
  return Math.round(base * Math.pow(Math.max(pixelRate, 0.05), 0.75));
}

const CRF = { draft: 28, standard: 23, high: 18, lossless: 10 } as const;

export function containerFor(settings: ExportSettings): string {
  if (settings.format === 'audio') return settings.audioCodec === 'mp3' ? 'mp3' : settings.audioCodec === 'opus' ? 'ogg' : 'm4a';
  return settings.format;
}

/** Resolve codec choice against container and alpha requirements. */
export function resolveVideoCodec(settings: ExportSettings): ExportSettings['videoCodec'] {
  if (settings.format === 'gif') return 'gif';
  if (settings.format === 'webm') return 'vp9';
  if (settings.transparentBackground) return settings.format === 'mov' ? 'prores' : 'vp9';
  if (settings.format === 'mp4' && (settings.videoCodec === 'prores' || settings.videoCodec === 'vp9' || settings.videoCodec === 'gif')) return 'h264';
  return settings.videoCodec;
}

function videoArgs(settings: ExportSettings, target: EncodeTarget): string[] {
  const codec = resolveVideoCodec(settings);
  const hw = settings.hardwareAcceleration && target.platform === 'darwin';
  const kbps = targetBitrateKbps(settings, target.size, target.fps);
  const alpha = settings.transparentBackground;
  switch (codec) {
    case 'h264':
      return hw
        ? ['-c:v', 'h264_videotoolbox', '-b:v', `${kbps}k`, '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-allow_sw', '1']
        : ['-c:v', 'libx264', '-preset', settings.quality === 'draft' ? 'veryfast' : 'medium', '-crf', String(CRF[settings.quality]), '-maxrate', `${kbps * 1.5}k`, '-bufsize', `${kbps * 3}k`, '-pix_fmt', 'yuv420p'];
    case 'hevc':
      return hw
        ? ['-c:v', 'hevc_videotoolbox', '-b:v', `${Math.round(kbps * 0.7)}k`, '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p', '-allow_sw', '1']
        : ['-c:v', 'libx265', '-preset', 'medium', '-crf', String(CRF[settings.quality] + 4), '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p'];
    case 'prores':
      return hw && !alpha
        ? ['-c:v', 'prores_videotoolbox', '-profile:v', settings.quality === 'lossless' ? '3' : '2']
        : ['-c:v', 'prores_ks', '-profile:v', alpha ? '4' : '3', '-pix_fmt', alpha ? 'yuva444p10le' : 'yuv422p10le', '-vendor', 'apl0'];
    case 'vp9':
      return ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(CRF[settings.quality] + 10), '-row-mt', '1', '-deadline', settings.quality === 'draft' ? 'realtime' : 'good', '-pix_fmt', alpha ? 'yuva420p' : 'yuv420p'];
    case 'gif':
      return [];
  }
}

function audioArgs(settings: ExportSettings): string[] {
  if (settings.audioCodec === 'none' || settings.format === 'gif') return ['-an'];
  const codec = settings.format === 'webm' ? 'opus' : settings.audioCodec;
  switch (codec) {
    case 'opus':
      return ['-c:a', 'libopus', '-b:a', '160k'];
    case 'mp3':
      return ['-c:a', 'libmp3lame', '-b:a', '192k'];
    default:
      return ['-c:a', 'aac', '-b:a', '192k'];
  }
}

/**
 * ffmpeg arguments for encoding raw RGBA frames piped on stdin plus optional audio inputs.
 * Frames must be written as tightly packed RGBA of exactly `size`.
 */
export function buildEncodeArgs(settings: ExportSettings, target: EncodeTarget): string[] {
  const { width, height } = target.size;
  const args = ['-hide_banner', '-loglevel', 'error', '-progress', 'pipe:2', '-y'];
  const audioOnly = settings.format === 'audio';
  if (!audioOnly) {
    args.push('-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-r', String(target.fps), '-i', 'pipe:0');
  }
  for (const input of target.audio?.inputs ?? []) args.push('-i', input);

  const filters: string[] = [];
  if (target.audio?.filterComplex) filters.push(target.audio.filterComplex);
  if (settings.format === 'gif') {
    filters.push(`[0:v]fps=${Math.min(target.fps, 30)},split[g0][g1];[g0]palettegen=stats_mode=diff[gp];[g1][gp]paletteuse=dither=sierra2_4a[vout]`);
  }
  if (filters.length) args.push('-filter_complex', filters.join(';'));

  if (!audioOnly) args.push('-map', settings.format === 'gif' ? '[vout]' : '0:v');
  if (target.audio && settings.format !== 'gif' && settings.audioCodec !== 'none') args.push('-map', `[${target.audio.outLabel}]`);

  if (!audioOnly) args.push(...videoArgs(settings, target), '-r', String(target.fps));
  args.push(...(audioOnly ? audioArgs({ ...settings, format: 'mp4' }) : audioArgs(settings)));
  if (settings.format === 'mp4' || settings.format === 'mov') args.push('-movflags', '+faststart');
  if (target.audio && !audioOnly) args.push('-shortest');
  args.push(target.outputPath);
  return args;
}

/** Parse ffmpeg `-progress` key=value output; returns encoded time in ms, if present. */
export function parseProgress(chunk: string): number | null {
  const m = /out_time_(?:us|ms)=(\d+)/.exec(chunk);
  return m ? Math.round(Number(m[1]) / 1000) : null;
}
