import { CursorTrack } from '@framecast/cursor';
import type { Asset, ClipItem, Project, RecordingMetadata, Track, ZoomItem } from '@framecast/schema';

/**
 * Pre-processed, immutable view of a project used for frame evaluation. Rebuild whenever the
 * project object identity changes (cheap: heavy work is cached per recording + style).
 */
export class Composition {
  readonly assets: ReadonlyMap<string, Asset>;
  readonly screenTrack: Track | undefined;
  readonly overlayTracks: Track[];
  readonly audioTracks: Track[];
  readonly zooms: ZoomItem[];
  private readonly cursorTracks = new Map<string, CursorTrack>();

  constructor(
    readonly project: Project,
    readonly recordings: ReadonlyMap<string, RecordingMetadata>,
    cursorCache?: CursorTrackCache,
  ) {
    this.assets = new Map(project.assets.map((a) => [a.id, a]));
    const videoTracks = project.timeline.tracks.filter((t) => t.kind === 'video');
    this.screenTrack = videoTracks[0];
    this.overlayTracks = videoTracks.slice(1);
    this.audioTracks = project.timeline.tracks.filter((t) => t.kind === 'audio');
    this.zooms = project.timeline.tracks
      .filter((t) => t.kind === 'zoom' && !t.hidden)
      .flatMap((t) => t.items.filter((i): i is ZoomItem => i.type === 'zoom'));
    for (const [id, rec] of recordings) {
      this.cursorTracks.set(id, (cursorCache ?? defaultCache).get(rec, project.cursor));
    }
  }

  cursorTrackFor(recordingId: string | undefined): CursorTrack | undefined {
    return recordingId ? this.cursorTracks.get(recordingId) : undefined;
  }

  recordingForClip(clip: ClipItem): RecordingMetadata | undefined {
    const rid = this.assets.get(clip.assetId)?.recordingId;
    return rid ? this.recordings.get(rid) : undefined;
  }

  /** Webcam asset recorded alongside the given screen asset. */
  webcamFor(clip: ClipItem): Asset | undefined {
    const rid = this.assets.get(clip.assetId)?.recordingId;
    if (!rid) return undefined;
    return this.project.assets.find((a) => a.recordingId === rid && a.role === 'webcam');
  }
}

/** Caches CursorTrack preprocessing keyed by recording + the style fields that affect it. */
export class CursorTrackCache {
  private cache = new WeakMap<RecordingMetadata, Map<string, CursorTrack>>();

  get(rec: RecordingMetadata, style: Project['cursor']): CursorTrack {
    const key = `${style.smoothing}|${style.hideWhenIdle}|${style.idleTimeoutMs}|${style.clickScale}`;
    let byStyle = this.cache.get(rec);
    if (!byStyle) {
      byStyle = new Map();
      this.cache.set(rec, byStyle);
    }
    let track = byStyle.get(key);
    if (!track) {
      track = new CursorTrack(rec.events, style);
      byStyle.clear(); // keep only the latest style per recording
      byStyle.set(key, track);
    }
    return track;
  }
}

const defaultCache = new CursorTrackCache();
