import { newId, type Project, type RecordingMetadata, type TextItem } from '@framecast/schema';
import { addItem } from '@framecast/timeline';
import { generateAutoZooms, getZoomPreset } from '@framecast/zoom';

/** Builds the demo project used by the browser mock (mirrors main's addRecordingToProject). */
export function addRecordingToProjectForDemo(project: Project, rec: RecordingMetadata): Project {
  const screenAsset = {
    id: newId('ast'), role: 'screen' as const, name: 'Demo screen', path: 'screen.png', mimeType: 'image/png',
    durationMs: rec.durationMs, size: rec.captureSize, hasAudio: false, recordingId: rec.id,
  };
  const [screenTrack] = project.timeline.tracks;
  const zoomTrack = project.timeline.tracks.find((t) => t.kind === 'zoom')!;
  const textTrack = project.timeline.tracks.find((t) => t.kind === 'text')!;
  let tl = addItem(project.timeline, screenTrack!.id, {
    id: newId('clip'), type: 'clip', assetId: screenAsset.id, start: 0, duration: rec.durationMs, sourceIn: 0, speed: 1,
    reverse: false, freezeFrame: false, volume: 1, muted: false, fadeInMs: 0, fadeOutMs: 0, transitionIn: null,
    crop: { top: 0, right: 0, bottom: 0, left: 0 }, color: { brightness: 1, contrast: 1, saturation: 1 }, keyframes: {},
  });
  for (const z of generateAutoZooms(rec.events, getZoomPreset('smooth'), { durationMs: rec.durationMs })) tl = addItem(tl, zoomTrack.id, z);
  const title: TextItem = {
    id: newId('text'), type: 'text', start: 300, duration: 2600, text: 'Meet the new dashboard',
    style: { fontFamily: 'Inter', fontSizePx: 84, fontWeight: 800, color: '#ffffff', align: 'center', lineHeight: 1.2, letterSpacingPx: -1, background: 'rgba(17,17,27,0.72)', backgroundPaddingPx: 28, backgroundRadiusPx: 22, stroke: null, shadow: null },
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 },
    animationIn: { presetId: 'kinetic', durationMs: 900, delayMs: 0, speed: 1, direction: 'up', params: {} },
    animationOut: { presetId: 'blurReveal', durationMs: 400, delayMs: 0, speed: 1, direction: 'none', params: {} },
    keyframes: {},
  };
  tl = addItem(tl, textTrack.id, title);
  return {
    ...project,
    timeline: tl,
    assets: [screenAsset],
    recordings: [{ id: rec.id, metadataPath: 'recordings/demo/metadata.json' }],
    subtitles: [{
      id: newId('sub'), language: 'en', label: 'English', visible: true, burnIn: true, source: 'manual',
      style: { preset: 'wordHighlight', fontFamily: 'Inter', fontSizePx: 44, fontWeight: 700, textColor: '#ffffff', activeWordColor: '#facc15', backgroundColor: 'rgba(0,0,0,0.6)', stroke: null, shadow: true, positionY: 0.88, align: 'center', lineSpacing: 1.25, letterSpacingPx: 0, uppercase: false, animationSpeed: 1, wordsPerLine: 8, maxLines: 2, safeAreaX: 0.08 },
      cues: [
        { id: 'c1', start: 3200, end: 6800, text: 'Open the analytics view from the sidebar.', words: [] },
        { id: 'c2', start: 7000, end: 11000, text: 'Then create a new report with one click.', words: [] },
        { id: 'c3', start: 11500, end: 17000, text: 'Framecast zooms in automatically wherever you click.', words: [] },
      ],
    }],
  };
}
