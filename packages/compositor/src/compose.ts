import {
  IDENTITY_EFFECT,
  NEUTRAL_POSE,
  clamp,
  evaluateChannels,
  evaluateItemAnimation,
  evaluateTransition,
  lerp,
  type LayerEffect,
} from '@framecast/animation';
import type { CursorTrack } from '@framecast/cursor';
import type { ClipItem, Rect, ShapeItem, TextItem, Track } from '@framecast/schema';
import { evaluateCaption } from '@framecast/subtitles';
import { clipSourceTime, itemEnd } from '@framecast/timeline';
import { evaluateCamera, type CameraState } from '@framecast/zoom';
import type { Composition } from './composition.js';
import { fitRect, layoutScreen } from './layout.js';
import type {
  AudioVoice,
  CaptionNode,
  CursorNode,
  FrameScene,
  OverlayNode,
  ScreenNode,
  SourceView,
  VideoLayer,
  WebcamNode,
} from './scene.js';

/** Approximate macOS cursor height as a fraction of the source width. */
const CURSOR_SOURCE_FRACTION = 0.014;

const clipAt = (track: Track | undefined, t: number): ClipItem | undefined =>
  track && !track.hidden
    ? (track.items.find((i) => i.type === 'clip' && t >= i.start && t < itemEnd(i)) as ClipItem | undefined)
    : undefined;

function fadeGain(clip: ClipItem, t: number): number {
  const local = t - clip.start;
  let g = 1;
  if (clip.fadeInMs > 0) g *= clamp(local / clip.fadeInMs);
  if (clip.fadeOutMs > 0) g *= clamp((clip.duration - local) / clip.fadeOutMs);
  return g;
}

/** Apply normalized crop insets: map a view in cropped space to raw source space. */
function applyCrop(view: SourceView, crop: ClipItem['crop']): SourceView {
  const w = 1 - crop.left - crop.right;
  const h = 1 - crop.top - crop.bottom;
  return { x: crop.left + view.x * w, y: crop.top + view.y * h, width: view.width * w, height: view.height * h };
}

interface ScreenEval {
  node: ScreenNode;
  primary: { clip: ClipItem; view: SourceView; sourceTime: number; camera: CameraState; cursor?: CursorTrack };
}

function evaluateScreen(comp: Composition, t: number): ScreenEval | null {
  const { project } = comp;
  const clip = clipAt(comp.screenTrack, t);
  if (!clip) return null;
  const asset = comp.assets.get(clip.assetId);
  const rec = comp.recordingForClip(clip);
  const size = asset?.size ?? rec?.captureSize;
  const cropW = 1 - clip.crop.left - clip.crop.right;
  const cropH = 1 - clip.crop.top - clip.crop.bottom;
  const sourceAspect = size ? (size.width * cropW) / (size.height * cropH) : 16 / 9;
  const layout = layoutScreen(project.canvas.size, sourceAspect, project.frame, project.canvas.reframeFocus === 'cursor');
  const cursor = comp.cursorTrackFor(rec?.id);
  const sourceTime = clipSourceTime(clip, t) ?? clip.sourceIn;

  const focusAt = cursor && !cursor.isEmpty
    ? (tt: number) => {
        const st = clipSourceTime(clip, tt) ?? sourceTime;
        const s = cursor.sample(st);
        return { x: s.x, y: s.y };
      }
    : undefined;
  const camera = evaluateCamera(comp.zooms, t, focusAt);

  // Base window: full frame, or a cursor-following crop for vertical reframing.
  const contentAspect = layout.content.width / layout.content.height;
  const baseW = layout.reframed ? Math.min(1, contentAspect / sourceAspect) : 1;
  const focusX = focusAt?.(t).x ?? 0.5;
  const baseCx = layout.reframed ? clamp(focusX, baseW / 2, 1 - baseW / 2) : 0.5;
  const vw = baseW / camera.scale;
  const vh = 1 / camera.scale;
  const cx = clamp(lerp(baseCx, camera.center.x, camera.amount), vw / 2, 1 - vw / 2);
  const cy = clamp(lerp(0.5, camera.center.y, camera.amount), vh / 2, 1 - vh / 2);
  const view = applyCrop({ x: cx - vw / 2, y: cy - vh / 2, width: vw, height: vh }, clip.crop);

  const layer = (c: ClipItem, st: number, effect: LayerEffect): VideoLayer => ({
    kind: 'video', clipId: c.id, assetId: c.assetId, sourceTime: st, view, dest: layout.content,
    opacity: fadeGain(c, t), rotationDeg: project.frame.rotationDeg, effect, color: c.color,
  });

  const layers: VideoLayer[] = [];
  const tr = clip.transitionIn;
  if (tr && t < clip.start + tr.durationMs) {
    const prev = comp.screenTrack!.items.find(
      (i): i is ClipItem => i.type === 'clip' && Math.abs(itemEnd(i) - clip.start) < 1,
    );
    const fx = evaluateTransition(tr.presetId, (t - clip.start) / tr.durationMs, tr.easing);
    if (prev) {
      const prevSt = prev.freezeFrame ? prev.sourceIn : prev.sourceIn + (t - prev.start) * prev.speed;
      layers.push(layer(prev, prevSt, fx.outgoing));
    }
    layers.push(layer(clip, sourceTime, fx.incoming));
  } else {
    layers.push(layer(clip, sourceTime, IDENTITY_EFFECT));
  }
  return {
    node: { layers, layout, style: project.frame, zoomAmount: camera.amount },
    primary: { clip, view, sourceTime, camera, cursor },
  };
}

function evaluateCursor(comp: Composition, screen: ScreenEval): CursorNode | null {
  const style = comp.project.cursor;
  const { cursor, view, sourceTime, clip } = screen.primary;
  if (!cursor || cursor.isEmpty) return null;
  const rec = comp.recordingForClip(clip);
  const content = screen.node.layout.content;
  const toCanvas = (p: { x: number; y: number }) => ({
    x: content.x + ((p.x - view.x) / view.width) * content.width,
    y: content.y + ((p.y - view.y) / view.height) * content.height,
  });
  const s = cursor.sample(sourceTime);
  const pos = toCanvas(s);
  const pxPerSourceWidth = content.width / view.width;
  return {
    ...pos,
    sizePx: CURSOR_SOURCE_FRACTION * pxPerSourceWidth * style.size * s.scale,
    opacity: style.visible ? s.opacity * (screen.node.layers.at(-1)?.opacity ?? 1) : 0,
    shape: s.shape,
    style,
    drawGlyph: style.visible && !(rec?.cursorBakedIn ?? false),
    clicks: style.clickEffect === 'none'
      ? []
      : cursor.activeClicks(sourceTime).map((c) => ({ ...toCanvas(c.click), progress: c.progress })),
    trail: style.trail ? cursor.trail(sourceTime, style.trail.lengthMs).map(toCanvas) : [],
  };
}

function evaluateWebcam(comp: Composition, screen: ScreenEval | null): WebcamNode | null {
  const style = comp.project.webcam;
  if (!style.visible || !screen) return null;
  const asset = comp.webcamFor(screen.primary.clip);
  if (!asset) return null;
  const { width: W, height: H } = comp.project.canvas.size;
  const shrink = style.shrinkOnZoom ? lerp(1, 0.72, screen.primary.camera.amount) : 1;
  const w = style.size * W * shrink;
  const h = style.shape === 'rounded' ? w * 0.75 : w;
  const rect: Rect = {
    x: clamp(style.position.x * W - w / 2, 0, W - w),
    y: clamp(style.position.y * H - h / 2, 0, H - h),
    width: w,
    height: h,
  };
  return { assetId: asset.id, sourceTime: screen.primary.sourceTime, rect, style, opacity: screen.node.layers.at(-1)?.opacity ?? 1 };
}

function evaluateText(item: TextItem, t: number): OverlayNode {
  const local = t - item.start;
  const k = evaluateChannels(item.keyframes, local, {
    x: item.transform.x, y: item.transform.y, scale: item.transform.scale,
    rotation: item.transform.rotation, opacity: item.transform.opacity,
  });
  const pose = evaluateItemAnimation(local, item.duration, item.animationIn, item.animationOut);
  return {
    kind: 'text', item,
    x: (k.x ?? 0.5) + pose.dx, y: (k.y ?? 0.5) + pose.dy,
    scale: (k.scale ?? 1) * pose.scale, rotationDeg: (k.rotation ?? 0) + pose.rotation,
    opacity: clamp((k.opacity ?? 1) * pose.opacity), pose,
  };
}

function evaluateShape(item: ShapeItem, t: number): OverlayNode {
  const local = t - item.start;
  const k = evaluateChannels(item.keyframes, local, { x: 0, y: 0, opacity: item.transform.opacity });
  const pose = item.animationIn || item.animationOut
    ? evaluateItemAnimation(local, item.duration, item.animationIn, item.animationOut)
    : { ...NEUTRAL_POSE };
  const dx = (k.x ?? 0) + pose.dx;
  const dy = (k.y ?? 0) + pose.dy;
  return {
    kind: 'shape', item,
    from: { x: item.from.x + dx, y: item.from.y + dy },
    to: { x: item.to.x + dx, y: item.to.y + dy },
    opacity: clamp((k.opacity ?? 1) * pose.opacity), pose,
  };
}

function evaluateOverlayClip(comp: Composition, clip: ClipItem, t: number): VideoLayer {
  const { width: W, height: H } = comp.project.canvas.size;
  const asset = comp.assets.get(clip.assetId);
  const aspect = asset?.size ? asset.size.width / asset.size.height : 16 / 9;
  const local = t - clip.start;
  const k = evaluateChannels(clip.keyframes, local, { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 });
  const base = fitRect({ x: 0, y: 0, width: W, height: H }, aspect);
  const s = k.scale ?? 1;
  const dest = {
    width: base.width * s, height: base.height * s,
    x: (k.x ?? 0.5) * W - (base.width * s) / 2, y: (k.y ?? 0.5) * H - (base.height * s) / 2,
  };
  return {
    kind: 'video', clipId: clip.id, assetId: clip.assetId, sourceTime: clipSourceTime(clip, t) ?? clip.sourceIn,
    view: applyCrop({ x: 0, y: 0, width: 1, height: 1 }, clip.crop), dest,
    opacity: clamp((k.opacity ?? 1) * fadeGain(clip, t)), rotationDeg: k.rotation ?? 0,
    effect: IDENTITY_EFFECT, color: clip.color,
  };
}

function evaluateAudio(comp: Composition, t: number): AudioVoice[] {
  const voices: AudioVoice[] = [];
  for (const track of comp.project.timeline.tracks) {
    if ((track.kind !== 'audio' && track.kind !== 'video') || track.muted) continue;
    const clip = clipAt(track, t);
    if (!clip || clip.muted || clip.reverse || clip.freezeFrame) continue;
    const asset = comp.assets.get(clip.assetId);
    if (!asset || (track.kind === 'video' && !asset.hasAudio)) continue;
    voices.push({
      clipId: clip.id, assetId: clip.assetId, sourceTime: clipSourceTime(clip, t) ?? clip.sourceIn,
      gain: clip.volume * track.volume * fadeGain(clip, t), rate: clip.speed,
    });
  }
  return voices;
}

/**
 * Evaluate the full scene at timeline time t (ms). Pure function of (composition, t):
 * the preview and the exporter both call this, guaranteeing identical output.
 */
export function composeFrame(comp: Composition, t: number): FrameScene {
  const { project } = comp;
  const screen = evaluateScreen(comp, t);
  const overlays: OverlayNode[] = [];
  for (const track of project.timeline.tracks) {
    if (track.hidden || track === comp.screenTrack) continue;
    for (const item of track.items) {
      if (t < item.start || t >= itemEnd(item)) continue;
      if (item.type === 'text') overlays.push(evaluateText(item, t));
      else if (item.type === 'shape') overlays.push(evaluateShape(item, t));
      else if (item.type === 'clip' && track.kind === 'video') overlays.push(evaluateOverlayClip(comp, item, t));
    }
  }
  const captions: CaptionNode[] = [];
  for (const sub of project.subtitles) {
    if (!sub.visible) continue;
    const frame = evaluateCaption(sub, t);
    if (frame) captions.push({ frame, style: sub.style });
  }
  const bg = project.canvas.background;
  return {
    t,
    size: project.canvas.size,
    background: bg,
    backgroundAngleDeg: bg.type === 'gradient' ? bg.angleDeg + (bg.animateDegPerSec * t) / 1000 : 0,
    transparent: project.export.transparentBackground,
    screen: screen?.node ?? null,
    cursor: screen ? evaluateCursor(comp, screen) : null,
    webcam: evaluateWebcam(comp, screen),
    overlays,
    captions,
    audio: evaluateAudio(comp, t),
  };
}
