import { createProject, type RecordingMetadata } from '@framecast/schema';
import { describe, expect, it } from 'vitest';
import { addRecordingToProject } from './build-project.js';
import { RecordingClock } from './clock.js';

describe('RecordingClock', () => {
  it('excludes paused time', () => {
    const c = new RecordingClock();
    c.start(1000);
    expect(c.timeAt(2000)).toBe(1000);
    c.pause(2000);
    expect(c.timeAt(2500)).toBeNull();
    expect(c.elapsed(9000)).toBe(1000);
    c.resume(5000);
    expect(c.timeAt(6000)).toBe(2000);
    expect(c.pauses).toEqual([{ atMs: 1000, wallDurationMs: 3000 }]);
  });
});

describe('addRecordingToProject', () => {
  it('creates assets, clips and auto zooms', () => {
    const meta: RecordingMetadata = {
      schemaVersion: 1, id: 'rec_1', createdAt: '2026-01-01T00:00:00.000Z', appVersion: 't', engine: 'screencapturekit',
      source: { kind: 'display', displayId: '1', name: 'Built-in' }, captureSize: { width: 2880, height: 1800 },
      durationMs: 20000, cursorBakedIn: false, pauses: [], recovered: false,
      tracks: [
        { id: 't1', kind: 'screen', file: 'screen.mov', mimeType: 'video/quicktime', durationMs: 20000, startOffsetMs: 0 },
        { id: 't2', kind: 'microphone', file: 'mic.m4a', mimeType: 'audio/mp4', durationMs: 19950, startOffsetMs: 30 },
        { id: 't3', kind: 'webcam', file: 'cam.mov', mimeType: 'video/quicktime', durationMs: 20000, startOffsetMs: 0 },
      ],
      events: [
        { type: 'move', t: 0, x: 0.5, y: 0.5 },
        { type: 'down', t: 5000, x: 0.3, y: 0.3, button: 'left' },
        { type: 'up', t: 5080, x: 0.3, y: 0.3, button: 'left' },
      ],
    };
    const p = addRecordingToProject(createProject('R'), meta, 'recordings/rec_1');
    expect(p.assets.map((a) => a.role)).toEqual(['screen', 'microphone', 'webcam']);
    expect(p.assets[0]!.path).toBe('recordings/rec_1/screen.mov');
    const kinds = p.timeline.tracks.filter((t) => t.items.length > 0).map((t) => t.name);
    expect(kinds).toEqual(['Screen', 'Microphone', 'Zoom']);
    expect(p.recordings[0]!.metadataPath).toBe('recordings/rec_1/metadata.json');
  });
});
