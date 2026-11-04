import type { Asset, ClipItem, Project } from '@framecast/schema';

export interface AudioGraph {
  inputs: string[];
  filterComplex: string;
  outLabel: string;
}

const s = (ms: number) => (ms / 1000).toFixed(3);

/** atempo accepts 0.5..2 per instance on older ffmpeg builds; chain to reach any rate. */
export function atempoChain(rate: number): string[] {
  const out: string[] = [];
  let r = rate;
  while (r > 2) { out.push('atempo=2'); r /= 2; }
  while (r < 0.5) { out.push('atempo=0.5'); r /= 0.5; }
  if (Math.abs(r - 1) > 1e-3) out.push(`atempo=${Number(r.toFixed(4))}`);
  return out;
}

const VOICE_ROLES = new Set<Asset['role']>(['microphone']);

/**
 * Build an ffmpeg filter graph mixing all audible clips of the timeline. Input indices start at
 * `firstInputIndex` (1 when stdin video is input 0). Returns null when the timeline is silent.
 */
export function buildAudioGraph(
  project: Project,
  resolvePath: (asset: Asset) => string,
  {
    firstInputIndex = 1,
    totalDurationMs,
    rangeStartMs = 0,
  }: { firstInputIndex?: number; totalDurationMs: number; rangeStartMs?: number },
): AudioGraph | null {
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const inputs: string[] = [];
  const inputIndex = new Map<string, number>();
  const chains: string[] = [];
  const voice: string[] = [];
  const other: string[] = [];

  for (const track of project.timeline.tracks) {
    if ((track.kind !== 'audio' && track.kind !== 'video') || track.muted) continue;
    for (const item of track.items) {
      if (item.type !== 'clip') continue;
      const clip: ClipItem = item;
      const asset = assets.get(clip.assetId);
      if (!asset || clip.muted || clip.freezeFrame) continue;
      if (track.kind === 'video' && !asset.hasAudio) continue;
      if (!inputIndex.has(asset.id)) {
        inputIndex.set(asset.id, firstInputIndex + inputs.length);
        inputs.push(resolvePath(asset));
      }
      const idx = inputIndex.get(asset.id)!;
      const label = `a${chains.length}`;
      const srcStart = clip.sourceIn;
      const srcEnd = clip.sourceIn + clip.duration * clip.speed;
      const parts = [`[${idx}:a]atrim=start=${s(srcStart)}:end=${s(srcEnd)}`, 'asetpts=PTS-STARTPTS'];
      if (clip.reverse) parts.push('areverse');
      parts.push(...atempoChain(clip.speed));
      const gain = clip.volume * track.volume;
      if (Math.abs(gain - 1) > 1e-3) parts.push(`volume=${gain.toFixed(3)}`);
      if (clip.fadeInMs > 0) parts.push(`afade=t=in:st=0:d=${s(clip.fadeInMs)}`);
      if (clip.fadeOutMs > 0) parts.push(`afade=t=out:st=${s(clip.duration - clip.fadeOutMs)}:d=${s(clip.fadeOutMs)}`);
      parts.push(`adelay=${Math.round(clip.start)}:all=1`);
      chains.push(`${parts.join(',')}[${label}]`);
      (VOICE_ROLES.has(asset.role) ? voice : other).push(`[${label}]`);
    }
  }
  if (chains.length === 0) return null;

  const mix = (labels: string[], out: string) =>
    labels.length === 1 ? `${labels[0]}anull[${out}]` : `${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0[${out}]`;

  const graph = [...chains];
  let voiceOut: string | null = null;
  if (voice.length) {
    graph.push(mix(voice, 'voice'));
    voiceOut = '[voice]';
    if (project.audio.noiseReduction) {
      graph.push('[voice]afftdn=nf=-25[voicenr]');
      voiceOut = '[voicenr]';
    }
  }
  let final: string;
  if (voiceOut && other.length) {
    graph.push(mix(other, 'bed'));
    if (project.audio.duckingDb > 0) {
      const ratio = Math.min(20, 1 + project.audio.duckingDb / 3).toFixed(1);
      graph.push(`${voiceOut}asplit=2[vmain][vkey]`);
      graph.push(`[bed][vkey]sidechaincompress=threshold=0.03:ratio=${ratio}:attack=20:release=500[ducked]`);
      graph.push('[vmain][ducked]amix=inputs=2:normalize=0[mixed]');
    } else {
      graph.push(`${voiceOut}[bed]amix=inputs=2:normalize=0[mixed]`);
    }
    final = '[mixed]';
  } else if (voiceOut) final = voiceOut;
  else {
    graph.push(mix(other, 'bed'));
    final = '[bed]';
  }
  // Pad to the full timeline, then cut out the exported range [rangeStartMs, totalDurationMs).
  const tail = [`apad=whole_dur=${s(totalDurationMs)}`, `atrim=start=${s(rangeStartMs)}:end=${s(totalDurationMs)}`, 'asetpts=PTS-STARTPTS'];
  if (project.audio.normalize) tail.unshift('loudnorm=I=-16:TP=-1.5:LRA=11');
  graph.push(`${final}${tail.join(',')}[aout]`);
  return { inputs, filterComplex: graph.join(';'), outLabel: 'aout' };
}
