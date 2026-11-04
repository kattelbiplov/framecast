import { getAnimationPreset } from '@framecast/animation';
import { TextStyle, newId, type AnimationRef, type ClipItem, type GraphicItem, type GraphicKind, type ShapeItem, type ShapeKind, type TextItem, type ZoomItem } from '@framecast/schema';

export function animationRef(presetId: string, overrides: Partial<AnimationRef> = {}): AnimationRef {
  const preset = getAnimationPreset(presetId);
  return { presetId, durationMs: preset?.defaultDurationMs ?? 400, delayMs: 0, speed: 1, direction: 'up', params: {}, ...overrides };
}

export function makeClip(assetId: string, start: number, duration: number, extra: Partial<ClipItem> = {}): ClipItem {
  return {
    id: newId('clip'), type: 'clip', assetId, start, duration, sourceIn: 0, speed: 1, reverse: false, freezeFrame: false,
    volume: 1, muted: false, fadeInMs: 0, fadeOutMs: 0, transitionIn: null, crop: { top: 0, right: 0, bottom: 0, left: 0 },
    color: { brightness: 1, contrast: 1, saturation: 1 }, keyframes: {}, ...extra,
  };
}

export function makeZoom(start: number, extra: Partial<ZoomItem> = {}): ZoomItem {
  return {
    id: newId('zoom'), type: 'zoom', start, duration: 3000, scale: 2, focus: { mode: 'followCursor' },
    transitionInMs: 700, transitionOutMs: 700, easing: 'easeInOutCubic', origin: 'manual', disabled: false, ...extra,
  };
}

export interface TextPreset {
  id: string;
  name: string;
  make(start: number): TextItem;
}

const text = (start: number, value: string, style: Partial<TextStyle>, y: number, anim: string, duration = 3000): TextItem => ({
  id: newId('text'), type: 'text', start, duration, text: value, style: TextStyle.parse(style),
  transform: { x: 0.5, y, scale: 1, rotation: 0, opacity: 1 },
  animationIn: animationRef(anim), animationOut: animationRef('fade', { durationMs: 300 }), keyframes: {},
});

export const TEXT_PRESETS: readonly TextPreset[] = [
  { id: 'title', name: 'Title', make: (s) => text(s, 'Your title', { fontSizePx: 96, fontWeight: 800, letterSpacingPx: -2 }, 0.45, 'kinetic') },
  { id: 'subtitle', name: 'Subtitle', make: (s) => text(s, 'A short supporting line', { fontSizePx: 48, fontWeight: 500, color: '#e5e7eb' }, 0.58, 'slide') },
  { id: 'lower-third', name: 'Lower third', make: (s) => text(s, 'Jane Cooper\nProduct Designer', { fontSizePx: 40, fontWeight: 700, align: 'left', background: 'rgba(17,17,27,0.85)', backgroundPaddingPx: 22, backgroundRadiusPx: 14 }, 0.82, 'slide', 4000) },
  { id: 'label', name: 'Label', make: (s) => text(s, 'Click here', { fontSizePx: 36, fontWeight: 700, background: '#6366f1', backgroundPaddingPx: 14, backgroundRadiusPx: 999 }, 0.3, 'pop') },
  { id: 'typewriter', name: 'Typewriter', make: (s) => text(s, 'npm install framecast', { fontFamily: 'JetBrains Mono', fontSizePx: 44, fontWeight: 500, background: 'rgba(0,0,0,0.75)', backgroundPaddingPx: 20 }, 0.5, 'typewriter') },
  { id: 'subscribe', name: 'Subscribe', make: (s) => text(s, '🔔 Subscribe for more', { fontSizePx: 44, fontWeight: 800, background: '#ef4444', backgroundPaddingPx: 18, backgroundRadiusPx: 16 }, 0.85, 'bounce', 3500) },
  { id: 'handle', name: 'Social handle', make: (s) => text(s, '@framecast', { fontSizePx: 40, fontWeight: 700, color: '#ffffff', shadow: { color: 'rgba(0,0,0,0.5)', blurPx: 12, offsetX: 0, offsetY: 4 } }, 0.9, 'charPop', 3500) },
  { id: 'glitch', name: 'Glitch', make: (s) => text(s, 'BREAKING CHANGE', { fontSizePx: 88, fontWeight: 900, color: '#22d3ee' }, 0.5, 'glitch', 2500) },
];

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  arrow: 'Arrow', line: 'Line', rectangle: 'Rectangle', ellipse: 'Circle', highlight: 'Highlight', spotlight: 'Spotlight',
  blur: 'Blur region', pixelate: 'Pixelate', step: 'Numbered step', callout: 'Callout', image: 'Image',
};

export function makeShape(shape: ShapeKind, start: number, extra: Partial<ShapeItem> = {}): ShapeItem {
  const box = shape === 'step' ? { from: { x: 0.47, y: 0.45 }, to: { x: 0.53, y: 0.55 } }
    : shape === 'arrow' || shape === 'line' ? { from: { x: 0.35, y: 0.65 }, to: { x: 0.5, y: 0.45 } }
    : shape === 'callout' ? { from: { x: 0.55, y: 0.25 }, to: { x: 0.8, y: 0.37 } }
    : { from: { x: 0.35, y: 0.35 }, to: { x: 0.65, y: 0.6 } };
  return {
    id: newId('shape'), type: 'shape', shape, start, duration: 3000, ...box,
    fill: null, stroke: shape === 'highlight' ? '#facc15' : '#ff3b30', strokeWidthPx: 6, cornerRadiusPx: 10,
    amount: shape === 'step' ? 1 : shape === 'pixelate' ? 16 : 14, label: shape === 'callout' ? 'New feature!' : '',
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 },
    animationIn: shape === 'blur' || shape === 'pixelate' ? null : animationRef(shape === 'arrow' || shape === 'line' || shape === 'rectangle' || shape === 'ellipse' ? 'drawOn' : 'pop'),
    animationOut: shape === 'blur' || shape === 'pixelate' ? null : animationRef('fade', { durationMs: 250 }),
    keyframes: {}, ...extra,
  };
}

export const GRAPHIC_LABELS: Record<GraphicKind, string> = {
  lowerThird: 'Lower third', progressBar: 'Progress bar', notification: 'Notification', barChart: 'Bar chart', subscribe: 'Subscribe', counter: 'Counter',
};

const GRAPHIC_DEFAULTS: Record<GraphicKind, Partial<GraphicItem>> = {
  lowerThird: { title: 'Jane Cooper', subtitle: 'Head of Product', transform: { x: 0.3, y: 0.82, scale: 1, rotation: 0, opacity: 1 }, duration: 4500 },
  progressBar: { title: '', transform: { x: 0.5, y: 0.965, scale: 1, rotation: 0, opacity: 1 }, duration: 10_000 },
  notification: { title: 'Deploy succeeded', subtitle: 'framecast-web is live on production', transform: { x: 0.8, y: 0.12, scale: 1, rotation: 0, opacity: 1 }, duration: 3500 },
  barChart: { title: 'Weekly active users', values: [12, 18, 15, 24, 31], labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 }, duration: 5000 },
  subscribe: { title: 'SUBSCRIBE', subtitle: 'SUBSCRIBED', primaryColor: '#ef4444', transform: { x: 0.5, y: 0.85, scale: 1, rotation: 0, opacity: 1 }, duration: 3500 },
  counter: { title: 'happy customers', values: [12500], labels: ['', '+'], primaryColor: '#ffffff', transform: { x: 0.5, y: 0.45, scale: 1, rotation: 0, opacity: 1 }, duration: 4000 },
};

export function makeGraphic(kind: GraphicKind, start: number): GraphicItem {
  return {
    id: newId('gfx'), type: 'graphic', kind, start, duration: 4000, title: '', subtitle: '', values: [], labels: [],
    primaryColor: '#6366f1', secondaryColor: '#ffffff', textColor: '#ffffff', fontFamily: 'Inter',
    transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 },
    animationIn: kind === 'progressBar' ? null : animationRef('fade', { durationMs: 250 }),
    animationOut: animationRef('fade', { durationMs: 300 }),
    keyframes: {},
    ...GRAPHIC_DEFAULTS[kind],
  };
}
