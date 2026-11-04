import type { ShapeNode } from '../scene.js';
import { fontString, roundRectPath, type Ctx2D, type RenderTarget } from './context.js';

/** Apply blur or pixelation to a region of what has been rendered so far. */
function privacyRegion(target: RenderTarget, ctx: Ctx2D, node: ShapeNode, x: number, y: number, w: number, h: number, scale: number): void {
  if (w < 1 || h < 1) return;
  const px = { x: x * scale, y: y * scale, w: w * scale, h: h * scale };
  const src = ctx.canvas as CanvasImageSource;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  roundRectPath(ctx, px.x, px.y, px.w, px.h, node.item.cornerRadiusPx * scale);
  ctx.clip();
  ctx.globalAlpha = node.opacity;
  if (node.item.shape === 'blur') {
    const scratch = target.createScratch(Math.ceil(px.w), Math.ceil(px.h));
    scratch.ctx.drawImage(src, px.x, px.y, px.w, px.h, 0, 0, px.w, px.h);
    ctx.filter = `blur(${node.item.amount * scale}px)`;
    ctx.drawImage(scratch.canvas, px.x, px.y);
  } else {
    const block = Math.max(2, node.item.amount * scale);
    const sw = Math.max(1, Math.round(px.w / block));
    const sh = Math.max(1, Math.round(px.h / block));
    const scratch = target.createScratch(sw, sh);
    scratch.ctx.imageSmoothingEnabled = true;
    scratch.ctx.drawImage(src, px.x, px.y, px.w, px.h, 0, 0, sw, sh);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scratch.canvas, 0, 0, sw, sh, px.x, px.y, px.w, px.h);
  }
  ctx.restore();
}

export function drawShape(target: RenderTarget, ctx: Ctx2D, node: ShapeNode, W: number, H: number, deviceScale: number): void {
  const it = node.item;
  if (node.opacity <= 0.001) return;
  const x1 = node.from.x * W;
  const y1 = node.from.y * H;
  const x2 = node.to.x * W;
  const y2 = node.to.y * H;
  const rx = Math.min(x1, x2);
  const ry = Math.min(y1, y2);
  const rw = Math.abs(x2 - x1);
  const rh = Math.abs(y2 - y1);
  const progress = node.pose.reveal; // draw-on progress for strokes

  if (it.shape === 'blur' || it.shape === 'pixelate') {
    privacyRegion(target, ctx, node, rx, ry, rw, rh, deviceScale);
    return;
  }
  ctx.save();
  ctx.globalAlpha *= node.opacity;
  ctx.lineWidth = it.strokeWidthPx;
  ctx.strokeStyle = it.stroke;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (it.shape) {
    case 'line':
    case 'arrow': {
      const ex = x1 + (x2 - x1) * progress;
      const ey = y1 + (y2 - y1) * progress;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      if (it.shape === 'arrow' && progress > 0.05) {
        const a = Math.atan2(y2 - y1, x2 - x1);
        const head = it.strokeWidthPx * 4;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - head * Math.cos(a - 0.45), ey - head * Math.sin(a - 0.45));
        ctx.lineTo(ex - head * Math.cos(a + 0.45), ey - head * Math.sin(a + 0.45));
        ctx.closePath();
        ctx.fillStyle = it.stroke;
        ctx.fill();
      }
      break;
    }
    case 'rectangle':
    case 'highlight':
      roundRectPath(ctx, rx, ry, rw, rh, it.cornerRadiusPx);
      if (it.shape === 'highlight') {
        ctx.fillStyle = it.fill ?? 'rgba(250,204,21,0.35)';
        ctx.fill();
      } else {
        if (it.fill) {
          ctx.fillStyle = it.fill;
          ctx.fill();
        }
        if (progress < 1) ctx.setLineDash([(rw + rh) * 2 * progress, (rw + rh) * 2]);
        ctx.stroke();
      }
      break;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      if (it.fill) {
        ctx.fillStyle = it.fill;
        ctx.fill();
      }
      ctx.stroke();
      break;
    case 'spotlight':
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2, true);
      ctx.fillStyle = it.fill ?? 'rgba(0,0,0,0.6)';
      ctx.fill('evenodd');
      break;
    case 'step': {
      const r = Math.max(rw, rh, 24) / 2;
      ctx.beginPath();
      ctx.arc(rx + rw / 2, ry + rh / 2, r, 0, Math.PI * 2);
      ctx.fillStyle = it.fill ?? it.stroke;
      ctx.fill();
      ctx.font = fontString(800, r * 1.1, 'Inter');
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.label || String(Math.round(it.amount)), rx + rw / 2, ry + rh / 2 + r * 0.05);
      break;
    }
    case 'callout': {
      roundRectPath(ctx, rx, ry, rw, rh, it.cornerRadiusPx);
      ctx.fillStyle = it.fill ?? '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 20;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      // tail
      ctx.beginPath();
      ctx.moveTo(rx + rw * 0.2, ry + rh);
      ctx.lineTo(rx + rw * 0.15, ry + rh + rh * 0.3);
      ctx.lineTo(rx + rw * 0.32, ry + rh);
      ctx.fill();
      ctx.font = fontString(600, Math.min(rh * 0.4, 40), 'Inter');
      ctx.fillStyle = it.stroke;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.label, rx + rw / 2, ry + rh / 2, rw * 0.9);
      break;
    }
    case 'image':
      // Images are resolved by the caller through FrameSources (see render.ts).
      break;
  }
  ctx.restore();
}
