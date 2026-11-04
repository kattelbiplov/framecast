import type { FrameScene, WebcamNode } from '../scene.js';
import { drawBackground } from './background.js';
import { drawCaption } from './captions.js';
import { intrinsicSize, roundRectPath, type Ctx2D, type FrameSources, type RenderTarget } from './context.js';
import { drawCursor } from './cursor.js';
import { drawGraphic } from './graphics.js';
import { drawVideoLayer, drawScreen } from './screen.js';
import { drawShape } from './shapes.js';
import { drawText } from './text.js';

function drawWebcam(ctx: Ctx2D, node: WebcamNode, sources: FrameSources): void {
  const img = sources.frame(node.assetId, node.sourceTime);
  if (!img) return;
  const { width: iw, height: ih } = intrinsicSize(img);
  if (!iw || !ih) return;
  const { rect, style } = node;
  const radius = style.shape === 'circle' ? rect.width / 2 : style.shape === 'rounded' ? rect.width * 0.12 : 0;
  ctx.save();
  ctx.globalAlpha *= node.opacity;
  if (style.shadow) {
    ctx.save();
    ctx.shadowColor = style.shadow.color;
    ctx.shadowBlur = style.shadow.blurPx;
    ctx.shadowOffsetY = style.shadow.offsetY;
    roundRectPath(ctx, rect.x, rect.y, rect.width, rect.height, radius);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  roundRectPath(ctx, rect.x, rect.y, rect.width, rect.height, radius);
  ctx.clip();
  // Cover-crop the camera frame into the shape.
  const scale = Math.max(rect.width / iw, rect.height / ih);
  const sw = rect.width / scale;
  const sh = rect.height / scale;
  if (style.mirror) {
    ctx.translate(rect.x * 2 + rect.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
  if (style.border && style.border.widthPx > 0) {
    roundRectPath(ctx, rect.x, rect.y, rect.width, rect.height, radius);
    ctx.lineWidth = style.border.widthPx;
    ctx.strokeStyle = style.border.color;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Render a scene into a 2D context. The scene is in logical canvas units; the target may be any
 * resolution — everything is scaled uniformly so preview and export match.
 */
export function renderScene(target: RenderTarget, scene: FrameScene, sources: FrameSources): void {
  const { ctx } = target;
  const W = scene.size.width;
  const H = scene.size.height;
  const k = target.width / W;
  ctx.save();
  ctx.setTransform(k, 0, 0, target.height / H, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, W, H);
  if (!scene.transparent) drawBackground(ctx, scene.background, scene.backgroundAngleDeg, W, H, sources, scene.t);

  if (scene.screen) {
    const cursor = scene.cursor;
    drawScreen(ctx, scene.screen, sources, W, cursor ? () => drawCursor(ctx, cursor, W, H) : undefined);
  }
  if (scene.webcam) drawWebcam(ctx, scene.webcam, sources);

  for (const node of scene.overlays) {
    if (node.kind === 'text') drawText(ctx, node, W, H);
    else if (node.kind === 'graphic') drawGraphic(ctx, node);
    else if (node.kind === 'shape') {
      if (node.item.shape === 'image' && node.item.assetId) {
        const img = sources.frame(node.item.assetId, 0);
        if (img) {
          ctx.save();
          ctx.globalAlpha *= node.opacity;
          const x = Math.min(node.from.x, node.to.x) * W;
          const y = Math.min(node.from.y, node.to.y) * H;
          ctx.drawImage(img, x, y, Math.abs(node.to.x - node.from.x) * W, Math.abs(node.to.y - node.from.y) * H);
          ctx.restore();
        }
      } else drawShape(target, ctx, node, W, H, k);
    } else {
      ctx.save();
      if (node.rotationDeg) {
        const cx = node.dest.x + node.dest.width / 2;
        const cy = node.dest.y + node.dest.height / 2;
        ctx.translate(cx, cy);
        ctx.rotate((node.rotationDeg * Math.PI) / 180);
        ctx.translate(-cx, -cy);
      }
      drawVideoLayer(ctx, node, sources, W);
      ctx.restore();
    }
  }
  for (const caption of scene.captions) drawCaption(ctx, caption, W, H);
  ctx.restore();
}
