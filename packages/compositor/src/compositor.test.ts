import { createProject, type Project, type RecordingMetadata } from '@framecast/schema';
import { addItem } from '@framecast/timeline';
import { describe, expect, it } from 'vitest';
import { Composition, aspectSize, composeFrame, layoutScreen } from './index.js';

function fixture(): { project: Project; recordings: Map<string, RecordingMetadata> } {
  let project = createProject('Comp');
  const rec: RecordingMetadata = {
    schemaVersion: 1, id: 'rec1', createdAt: new Date().toISOString(), appVersion: 'test', engine: 'chromium',
    source: { kind: 'display', displayId: '1', name: 'Display' }, captureSize: { width: 1920, height: 1080 },
    durationMs: 10000, tracks: [], cursorBakedIn: false, pauses: [], recovered: false,
    events: [
      { type: 'move', t: 0, x: 0.5, y: 0.5 },
      { type: 'move', t: 1000, x: 0.8, y: 0.2 },
      { type: 'down', t: 3000, x: 0.8, y: 0.2, button: 'left' },
      { type: 'up', t: 3050, x: 0.8, y: 0.2, button: 'left' },
      { type: 'move', t: 9000, x: 0.8, y: 0.2 },
    ],
  };
  project = {
    ...project,
    assets: [
      { id: 'scr', role: 'screen', name: 'Screen', path: 'a.webm', mimeType: 'video/webm', durationMs: 10000, size: { width: 1920, height: 1080 }, hasAudio: false, recordingId: 'rec1' },
      { id: 'cam', role: 'webcam', name: 'Cam', path: 'b.webm', mimeType: 'video/webm', durationMs: 10000, size: { width: 1280, height: 720 }, hasAudio: false, recordingId: 'rec1' },
    ],
  };
  const screenTrack = project.timeline.tracks[0]!.id;
  const zoomTrack = project.timeline.tracks.find((t) => t.kind === 'zoom')!.id;
  let tl = addItem(project.timeline, screenTrack, {
    id: 'clip1', type: 'clip', assetId: 'scr', start: 0, duration: 10000, sourceIn: 0, speed: 1, reverse: false,
    freezeFrame: false, volume: 1, muted: false, fadeInMs: 0, fadeOutMs: 0, transitionIn: null,
    crop: { top: 0, right: 0, bottom: 0, left: 0 }, color: { brightness: 1, contrast: 1, saturation: 1 }, keyframes: {},
  });
  tl = addItem(tl, zoomTrack, {
    id: 'z1', type: 'zoom', start: 2000, duration: 3000, scale: 2, focus: { mode: 'followCursor' },
    transitionInMs: 500, transitionOutMs: 500, easing: 'linear', origin: 'auto', disabled: false,
  });
  return { project: { ...project, timeline: tl }, recordings: new Map([['rec1', rec]]) };
}

describe('compositor', () => {
  it('lays out the screen with padding, and reframes for vertical canvases', () => {
    const p = createProject('x');
    const land = layoutScreen({ width: 1920, height: 1080 }, 16 / 9, p.frame, true);
    expect(land.reframed).toBe(false);
    expect(land.content.x).toBeGreaterThan(0);
    const vert = layoutScreen({ width: 1080, height: 1920 }, 16 / 9, p.frame, true);
    expect(vert.reframed).toBe(true);
    expect(vert.content.height).toBeGreaterThan(vert.content.width);
    expect(aspectSize('9:16', 1920)).toEqual({ width: 1080, height: 1920 });
  });

  it('composes a deterministic frame with zoom, cursor and webcam', () => {
    const { project, recordings } = fixture();
    const comp = new Composition(project, recordings);
    const before = composeFrame(comp, 1000);
    expect(before.screen!.layers[0]!.view.width).toBe(1);
    const zoomed = composeFrame(comp, 3500);
    const view = zoomed.screen!.layers[0]!.view;
    expect(view.width).toBeCloseTo(0.5);
    // Zoom follows the cursor (top-right), clamped inside the frame.
    expect(view.x + view.width).toBeCloseTo(1);
    expect(view.y).toBeCloseTo(0);
    expect(zoomed.cursor!.sizePx).toBeGreaterThan(before.cursor!.sizePx);
    expect(zoomed.webcam!.rect.width).toBeLessThan(before.webcam!.rect.width);
    expect(composeFrame(comp, 3500)).toEqual(zoomed);
  });

  it('shows click effects at click time', () => {
    const { project, recordings } = fixture();
    const scene = composeFrame(new Composition(project, recordings), 3100);
    expect(scene.cursor!.clicks).toHaveLength(1);
  });
});
