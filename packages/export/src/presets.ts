import type { AspectRatioPreset, ExportSettings } from '@framecast/schema';

export interface SocialPreset {
  id: string;
  name: string;
  aspect: AspectRatioPreset;
  settings: Partial<ExportSettings>;
  maxDurationSec?: number;
}

export const SOCIAL_PRESETS: readonly SocialPreset[] = [
  { id: 'youtube-1080', name: 'YouTube 1080p', aspect: '16:9', settings: { format: 'mp4', height: 1080, fps: 60, videoCodec: 'h264', quality: 'high' } },
  { id: 'youtube-4k', name: 'YouTube 4K', aspect: '16:9', settings: { format: 'mp4', height: 2160, fps: 60, videoCodec: 'hevc', quality: 'high' } },
  { id: 'x-twitter', name: 'X / Twitter', aspect: '16:9', settings: { format: 'mp4', height: 720, fps: 30, videoCodec: 'h264', quality: 'standard' }, maxDurationSec: 140 },
  { id: 'linkedin', name: 'LinkedIn', aspect: '1:1', settings: { format: 'mp4', height: 1080, fps: 30, videoCodec: 'h264', quality: 'standard' } },
  { id: 'instagram-reel', name: 'Instagram Reel', aspect: '9:16', settings: { format: 'mp4', height: 1920, fps: 30, videoCodec: 'h264', quality: 'high' }, maxDurationSec: 90 },
  { id: 'instagram-feed', name: 'Instagram feed', aspect: '4:5', settings: { format: 'mp4', height: 1350, fps: 30, videoCodec: 'h264', quality: 'high' } },
  { id: 'tiktok', name: 'TikTok / Shorts', aspect: '9:16', settings: { format: 'mp4', height: 1920, fps: 60, videoCodec: 'h264', quality: 'high' } },
  { id: 'gif', name: 'GIF (docs / chat)', aspect: '16:9', settings: { format: 'gif', height: 480, fps: 15, videoCodec: 'gif', audioCodec: 'none', quality: 'standard' } },
  { id: 'prores', name: 'ProRes master', aspect: '16:9', settings: { format: 'mov', height: 2160, fps: 60, videoCodec: 'prores', quality: 'lossless' } },
];

export const RESOLUTION_OPTIONS = [
  { label: '720p', height: 720 },
  { label: '1080p', height: 1080 },
  { label: '1440p', height: 1440 },
  { label: '4K', height: 2160 },
] as const;
