import {
  newId,
  type Asset,
  type ClipItem,
  type Project,
  type RecordedMediaTrack,
  type RecordingMetadata,
  type Track,
} from '@framecast/schema';
import { addItem } from '@framecast/timeline';
import { generateAutoZooms, getZoomPreset } from '@framecast/zoom';

const ROLE_TRACK: Record<RecordedMediaTrack['kind'], { kind: Track['kind']; name: string } | null> = {
  screen: { kind: 'video', name: 'Screen' },
  webcam: null, // webcam renders as a linked overlay styled by project.webcam
  microphone: { kind: 'audio', name: 'Microphone' },
  systemAudio: { kind: 'audio', name: 'System audio' },
};

function clipFor(asset: Asset, durationMs: number, startOffsetMs: number): ClipItem {
  return {
    id: newId('clip'), type: 'clip', assetId: asset.id, start: Math.max(0, startOffsetMs), duration: durationMs,
    sourceIn: 0, speed: 1, reverse: false, freezeFrame: false, volume: 1, muted: false, fadeInMs: 0, fadeOutMs: 0,
    transitionIn: null, crop: { top: 0, right: 0, bottom: 0, left: 0 },
    color: { brightness: 1, contrast: 1, saturation: 1 }, keyframes: {},
  };
}

/**
 * Turn a finished recording into an editable project: register assets, lay clips on tracks and
 * generate (editable, non-destructive) automatic zoom regions.
 * @param recordingDirRel recording directory relative to the project directory
 */
export function addRecordingToProject(project: Project, meta: RecordingMetadata, recordingDirRel: string): Project {
  const assets: Asset[] = meta.tracks.map((t) => ({
    id: newId('ast'),
    role: t.kind,
    name: `${t.kind} — ${new Date(meta.createdAt).toLocaleString()}`,
    path: `${recordingDirRel}/${t.file}`,
    mimeType: t.mimeType,
    durationMs: t.durationMs,
    size: t.size,
    hasAudio: t.kind === 'microphone' || t.kind === 'systemAudio',
    recordingId: meta.id,
  }));

  let timeline = project.timeline;
  meta.tracks.forEach((t, i) => {
    const target = ROLE_TRACK[t.kind];
    if (!target || t.durationMs <= 0) return;
    const track = timeline.tracks.find((tr) => tr.kind === target.kind && tr.name === target.name)
      ?? timeline.tracks.find((tr) => tr.kind === target.kind && tr.items.length === 0);
    if (!track) return;
    const clip = clipFor(assets[i]!, t.durationMs, t.startOffsetMs);
    // Chromium cannot capture a sub-region, so region recordings capture the display and are
    // cropped non-destructively here. The native engine crops at capture time instead.
    if (t.kind === 'screen' && meta.source.kind === 'region' && meta.engine === 'chromium') {
      const r = meta.source.region;
      clip.crop = { top: r.y, left: r.x, right: Math.max(0, 1 - r.x - r.width), bottom: Math.max(0, 1 - r.y - r.height) };
    }
    timeline = addItem(timeline, track.id, clip, { autoPlace: true });
  });

  if (project.autoZoom.enabled && meta.events.length > 0) {
    const zoomTrack = timeline.tracks.find((t) => t.kind === 'zoom');
    const screenClip = timeline.tracks.find((t) => t.kind === 'video')?.items.find((i) => i.type === 'clip' && assets.some((a) => a.id === i.assetId && a.role === 'screen'));
    if (zoomTrack && screenClip) {
      const zooms = generateAutoZooms(meta.events, getZoomPreset(project.autoZoom.presetId), {
        durationMs: meta.durationMs,
        timelineOffsetMs: screenClip.start,
      });
      for (const z of zooms) timeline = addItem(timeline, zoomTrack.id, z, { autoPlace: false });
    }
  }

  return {
    ...project,
    timeline,
    assets: [...project.assets, ...assets],
    recordings: [...project.recordings, { id: meta.id, metadataPath: `${recordingDirRel}/metadata.json` }],
    canvas: meta.captureSize && meta.captureSize.height > meta.captureSize.width
      ? { ...project.canvas, aspect: '9:16', size: { width: 1080, height: 1920 } }
      : project.canvas,
  };
}
