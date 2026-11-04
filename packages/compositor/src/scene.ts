import type { AnimationPose, LayerEffect } from '@framecast/animation';
import type {
  Background,
  CaptionStyle,
  ClipItem,
  GraphicItem,
  CursorStyle,
  FrameStyle,
  Rect,
  ShapeItem,
  Size,
  TextItem,
  WebcamStyle,
} from '@framecast/schema';
import type { CaptionFrame } from '@framecast/subtitles';

/** A normalized sub-rectangle of a source frame. */
export type SourceView = Rect;

export interface VideoLayer {
  kind: 'video';
  clipId: string;
  assetId: string;
  /** Position in source media (ms). */
  sourceTime: number;
  view: SourceView;
  dest: Rect;
  opacity: number;
  rotationDeg: number;
  effect: LayerEffect;
  color: ClipItem['color'];
}

export interface ScreenNode {
  layers: VideoLayer[];
  layout: { frame: Rect; content: Rect };
  style: FrameStyle;
  /** Zoom amount 0..1 (for motion blur / UI). */
  zoomAmount: number;
}

export interface CursorNode {
  x: number;
  y: number;
  /** Height of the cursor glyph in canvas px (includes zoom magnification and press scale). */
  sizePx: number;
  opacity: number;
  shape: string;
  style: CursorStyle;
  drawGlyph: boolean;
  clicks: { x: number; y: number; progress: number }[];
  trail: { x: number; y: number }[];
}

export interface WebcamNode {
  assetId: string;
  sourceTime: number;
  rect: Rect;
  style: WebcamStyle;
  opacity: number;
}

export interface TextNode {
  kind: 'text';
  item: TextItem;
  x: number;
  y: number;
  scale: number;
  rotationDeg: number;
  opacity: number;
  pose: AnimationPose;
}

export interface ShapeNode {
  kind: 'shape';
  item: ShapeItem;
  from: { x: number; y: number };
  to: { x: number; y: number };
  opacity: number;
  pose: AnimationPose;
}

export interface GraphicNode {
  kind: 'graphic';
  item: GraphicItem;
  /** Bounding box on the canvas (logical px), after scale and animation offsets. */
  box: { x: number; y: number; width: number; height: number };
  scale: number;
  rotationDeg: number;
  opacity: number;
  /** Time since the item started (ms) — drives the built-in animation. */
  localT: number;
  duration: number;
  pose: AnimationPose;
}

export type OverlayNode = TextNode | ShapeNode | GraphicNode | VideoLayer;

export interface CaptionNode {
  frame: CaptionFrame;
  style: CaptionStyle;
}

export interface AudioVoice {
  clipId: string;
  assetId: string;
  sourceTime: number;
  gain: number;
  rate: number;
}

export interface FrameScene {
  t: number;
  size: Size;
  background: Background;
  /** Background rotation for animated gradients. */
  backgroundAngleDeg: number;
  transparent: boolean;
  screen: ScreenNode | null;
  cursor: CursorNode | null;
  webcam: WebcamNode | null;
  overlays: OverlayNode[];
  captions: CaptionNode[];
  audio: AudioVoice[];
}
