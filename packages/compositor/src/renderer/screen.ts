import type { Rect } from '@framecast/schema';
import type { ScreenNode, VideoLayer } from '../scene.js';
import { intrinsicSize, roundRectPath, type Ctx2D, type FrameSources } from './context.js';

function colorFilter(c: VideoLayer['color'], blurPx: number): string {
  const parts: string[] = [];
  if (c.brightness !== 1) parts.push(`brightness(${c.brightness})`);
  if (c.contrast !== 1) parts.push(`contrast(${c.contrast})`);
  if (c.saturation !== 1) parts.push(`saturate(${c.saturation})`);
  if (blurPx > 0.1) parts.push(`blur(${blurPx}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

/** Draw one video layer into `dest`, applying its transition effect. Caller sets clipping. */
export function drawVideoLayer(ctx: Ctx2D, layer: VideoLayer, sources: FrameSources, W: number): void {
  const img = sources.frame(layer.assetId, layer.sourceTime);
  if (!img) return;
  const { width: iw, height: ih } = intrinsicSize(img);
  if (!iw || !ih) return;
  const { dest, view, effect } = layer;
  const opacity = layer.opacity * effect.opacity;
  if (opacity <= 0.001) return;
  ctx.save();
  ctx.globalAlpha *= opacity;
  const cx = dest.x + dest.width / 2;
  const cy = dest.y + dest.height / 2;
  ctx.translate(cx + effect.dx * W, cy + effect.dy * W);
  if (effect.rotation) ctx.rotate((effect.rotation * Math.PI) / 180);
  if (effect.scale !== 1) ctx.scale(effect.scale, effect.scale);
  ctx.translate(-cx, -cy);
  if (effect.wipe < 1) {
    // Directional wipe: reveal a growing band along the wipe angle.
    const a = (effect.wipeAngleDeg * Math.PI) / 180;
    const diag = Math.hypot(dest.width, dest.height);
    ctx.beginPath();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.rect(-diag / 2, -diag / 2, diag * effect.wipe, diag);
    ctx.restore();
    ctx.clip();
  }
  ctx.filter = colorFilter(layer.color, effect.blurPx);
  ctx.drawImage(img, view.x * iw, view.y * ih, view.width * iw, view.height * ih, dest.x, dest.y, dest.width, dest.height);
  ctx.restore();
}

function drawMockupChrome(ctx: Ctx2D, node: ScreenNode): void {
  const { frame, content } = node.layout;
  const { mockup, cornerRadiusPx } = node.style;
  if (mockup === 'none') return;
  ctx.save();
  if (mockup === 'browser') {
    roundRectPath(ctx, frame.x, frame.y, frame.width, frame.height, cornerRadiusPx);
    ctx.fillStyle = '#f1f3f4';
    ctx.fill();
    const barH = content.y - frame.y;
    const r = barH * 0.16;
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
      ctx.beginPath();
      ctx.arc(frame.x + barH * 0.5 + i * r * 3, frame.y + barH / 2, r, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
    });
    roundRectPath(ctx, frame.x + frame.width * 0.25, frame.y + barH * 0.22, frame.width * 0.5, barH * 0.56, barH * 0.28);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  } else if (mockup === 'macbook' || mockup === 'monitor') {
    // Lid / panel: bezel of equal width on all sides of the content.
    const lid: Rect = { x: frame.x, y: frame.y, width: frame.width, height: content.y + content.height - frame.y + (content.x - frame.x) };
    roundRectPath(ctx, lid.x, lid.y, lid.width, lid.height, cornerRadiusPx * 1.5);
    ctx.fillStyle = '#1c1c1e';
    ctx.fill();
    if (mockup === 'macbook') {
      const baseY = lid.y + lid.height;
      const baseH = frame.y + frame.height - baseY;
      ctx.beginPath();
      ctx.moveTo(frame.x - frame.width * 0.06, baseY);
      ctx.lineTo(frame.x + frame.width * 1.06, baseY);
      ctx.lineTo(frame.x + frame.width * 1.02, baseY + baseH * 0.5);
      ctx.lineTo(frame.x - frame.width * 0.02, baseY + baseH * 0.5);
      ctx.closePath();
      ctx.fillStyle = '#c7c7cc';
      ctx.fill();
    } else {
      const neckW = frame.width * 0.12;
      const baseY = lid.y + lid.height;
      ctx.fillStyle = '#8e8e93';
      ctx.fillRect(frame.x + frame.width / 2 - neckW / 2, baseY, neckW, (frame.y + frame.height - baseY) * 0.8);
      ctx.fillRect(frame.x + frame.width / 2 - neckW * 1.5, frame.y + frame.height - 8, neckW * 3, 8);
    }
  } else {
    // phone / tablet bezel
    roundRectPath(ctx, frame.x, frame.y, frame.width, frame.height, Math.min(frame.width, frame.height) * 0.12);
    ctx.fillStyle = '#0b0b0d';
    ctx.fill();
  }
  ctx.restore();
}

export function drawScreen(ctx: Ctx2D, node: ScreenNode, sources: FrameSources, W: number, drawInside?: () => void): void {
  const { content, frame } = node.layout;
  const style = node.style;
  const radius = style.mockup === 'phone' || style.mockup === 'tablet'
    ? Math.min(content.width, content.height) * 0.08
    : style.cornerRadiusPx;
  ctx.save();
  // Global frame transform: rotation + simulated perspective tilt around the frame centre.
  const cx = frame.x + frame.width / 2;
  const cy = frame.y + frame.height / 2;
  ctx.translate(cx, cy);
  if (style.rotationDeg) ctx.rotate((style.rotationDeg * Math.PI) / 180);
  if (style.tiltXDeg || style.tiltYDeg) {
    const kx = Math.tan((style.tiltYDeg * Math.PI) / 180) * 0.25;
    const ky = Math.tan((style.tiltXDeg * Math.PI) / 180) * 0.25;
    ctx.transform(1 - Math.abs(kx) * 0.3, ky, kx, 1 - Math.abs(ky) * 0.3, 0, 0);
  }
  ctx.translate(-cx, -cy);

  if (style.shadow) {
    ctx.save();
    ctx.shadowColor = style.shadow.color;
    ctx.shadowBlur = style.shadow.blurPx;
    ctx.shadowOffsetX = style.shadow.offsetX;
    ctx.shadowOffsetY = style.shadow.offsetY;
    const target = style.mockup === 'none' ? content : frame;
    roundRectPath(ctx, target.x, target.y, target.width, target.height, radius);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
  }
  drawMockupChrome(ctx, node);

  ctx.save();
  roundRectPath(ctx, content.x, content.y, content.width, content.height, style.mockup === 'browser' ? 0 : radius);
  ctx.clip();
  ctx.fillStyle = '#000';
  ctx.fillRect(content.x, content.y, content.width, content.height);
  for (const layer of node.layers) drawVideoLayer(ctx, layer, sources, W);
  drawInside?.();
  ctx.restore();

  if (style.border && style.border.widthPx > 0) {
    roundRectPath(ctx, content.x, content.y, content.width, content.height, radius);
    ctx.lineWidth = style.border.widthPx;
    ctx.strokeStyle = style.border.color;
    ctx.stroke();
  }
  ctx.restore();
}
