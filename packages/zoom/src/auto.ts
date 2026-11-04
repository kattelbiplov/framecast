import { extractClicks, extractRawPath, findIdleSpans } from '@framecast/cursor';
import { newId, type InteractionEvent, type ZoomItem } from '@framecast/schema';
import type { ZoomPreset } from './presets.js';

export interface PointOfInterest {
  t: number;
  x: number;
  y: number;
  kind: 'click' | 'doubleClick' | 'pause' | 'shortcut' | 'scroll';
}

/** Extract meaningful interactions from raw recording events according to preset triggers. */
export function findPointsOfInterest(
  events: readonly InteractionEvent[],
  preset: ZoomPreset,
): PointOfInterest[] {
  const pois: PointOfInterest[] = [];
  // Recordings without click data (e.g. click tracking unavailable or denied) would otherwise
  // get no zooms at all with click-driven presets; fall back to cursor pauses.
  const hasClicks = events.some((e) => e.type === 'down');
  const usePauses = preset.triggers.pauses || (preset.triggers.clicks && !hasClicks);
  if (preset.triggers.clicks) {
    for (const c of extractClicks(events)) {
      if (c.button === 'left') pois.push({ t: c.t, x: c.x, y: c.y, kind: c.double ? 'doubleClick' : 'click' });
    }
  }
  const path = extractRawPath(events);
  if (usePauses) {
    for (const span of findIdleSpans(path, preset.pauseMs)) {
      const p = path.find((pt) => pt.t >= span.start);
      if (p && Number.isFinite(span.end)) pois.push({ t: span.start, x: p.x, y: p.y, kind: 'pause' });
    }
  }
  let lastPos = { x: 0.5, y: 0.5 };
  for (const e of events) {
    if ('x' in e) lastPos = { x: e.x, y: e.y };
    if (preset.triggers.shortcuts && e.type === 'shortcut') pois.push({ t: e.t, ...lastPos, kind: 'shortcut' });
    if (preset.triggers.scroll && e.type === 'scroll') pois.push({ t: e.t, x: e.x, y: e.y, kind: 'scroll' });
  }
  return pois.sort((a, b) => a.t - b.t);
}

/** Group points of interest that occur within `clusterMs` of each other. */
export function clusterPoints(points: readonly PointOfInterest[], clusterMs: number): PointOfInterest[][] {
  const clusters: PointOfInterest[][] = [];
  for (const p of points) {
    const current = clusters[clusters.length - 1];
    const last = current?.[current.length - 1];
    if (current && last && p.t - last.t <= clusterMs) current.push(p);
    else clusters.push([p]);
  }
  return clusters;
}

export interface AutoZoomOptions {
  durationMs: number;
  /** Timeline offset of the screen clip (zoom items are in timeline time). */
  timelineOffsetMs?: number;
}

/**
 * Generate non-destructive zoom regions from recording interactions. The output is a list of
 * ordinary ZoomItems flagged `origin: 'auto'`, which the user may edit, disable or delete.
 */
export function generateAutoZooms(
  events: readonly InteractionEvent[],
  preset: ZoomPreset,
  { durationMs, timelineOffsetMs = 0 }: AutoZoomOptions,
): ZoomItem[] {
  const clusters = clusterPoints(findPointsOfInterest(events, preset), preset.clusterMs);
  const spans: { start: number; end: number; pts: PointOfInterest[] }[] = [];
  for (const pts of clusters) {
    const start = Math.max(0, pts[0]!.t - preset.leadMs - preset.transitionInMs);
    const end = Math.min(durationMs, pts[pts.length - 1]!.t + preset.holdMs + preset.transitionOutMs);
    const prev = spans[spans.length - 1];
    if (prev && start <= prev.end) {
      prev.end = Math.max(prev.end, end);
      prev.pts.push(...pts);
    } else {
      spans.push({ start, end, pts: [...pts] });
    }
  }
  return spans
    .filter((s) => s.end - s.start >= preset.minDurationMs)
    .map((s): ZoomItem => {
      const cx = s.pts.reduce((a, p) => a + p.x, 0) / s.pts.length;
      const cy = s.pts.reduce((a, p) => a + p.y, 0) / s.pts.length;
      return {
        id: newId('zoom'),
        type: 'zoom',
        start: Math.round(s.start + timelineOffsetMs),
        duration: Math.round(s.end - s.start),
        scale: preset.scale,
        focus: preset.followCursor ? { mode: 'followCursor' } : { mode: 'fixed', point: { x: cx, y: cy } },
        transitionInMs: preset.transitionInMs,
        transitionOutMs: preset.transitionOutMs,
        easing: preset.easing,
        origin: 'auto',
        disabled: false,
      };
    });
}
