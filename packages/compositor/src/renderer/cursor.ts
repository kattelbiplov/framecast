import { ease } from '@framecast/animation';
import type { CursorNode } from '../scene.js';
import type { Ctx2D } from './context.js';

/** macOS-style arrow, unit height, tip at (0,0). */
const ARROW: [number, number][] = [
  [0, 0], [0, 0.78], [0.2, 0.6], [0.33, 0.9], [0.45, 0.85], [0.32, 0.56], [0.58, 0.56],
];

function arrowPath(ctx: Ctx2D, x: number, y: number, h: number): void {
  ctx.beginPath();
  ARROW.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(x + px * h, y + py * h) : ctx.lineTo(x + px * h, y + py * h)));
  ctx.closePath();
}

export function drawCursor(ctx: Ctx2D, c: CursorNode, W: number, H: number): void {
  const { style } = c;
  if (style.spotlight && c.opacity > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(c.x, c.y, c.sizePx * 4, 0, Math.PI * 2, true);
    ctx.fillStyle = `rgba(0,0,0,${0.45 * c.opacity})`;
    ctx.fill('evenodd');
    ctx.restore();
  }

  for (const click of c.clicks) {
    const p = click.progress;
    ctx.save();
    ctx.globalAlpha = 1 - ease('easeIn', p);
    if (style.clickEffect === 'ripple') {
      ctx.beginPath();
      ctx.arc(click.x, click.y, c.sizePx * (0.4 + 1.6 * ease('easeOutCubic', p)), 0, Math.PI * 2);
      ctx.lineWidth = Math.max(2, c.sizePx * 0.12);
      ctx.strokeStyle = style.clickColor;
      ctx.stroke();
    } else if (style.clickEffect === 'pulse') {
      ctx.beginPath();
      ctx.arc(click.x, click.y, c.sizePx * (0.6 + 0.8 * Math.sin(p * Math.PI)), 0, Math.PI * 2);
      ctx.fillStyle = style.clickColor;
      ctx.fill();
    } else if (style.clickEffect === 'highlight') {
      ctx.beginPath();
      ctx.arc(click.x, click.y, c.sizePx * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = style.clickColor;
      ctx.fill();
    }
    ctx.restore();
  }

  if (!c.drawGlyph || c.opacity <= 0.01) return;
  ctx.save();
  ctx.globalAlpha *= c.opacity;

  if (c.trail.length > 1 && style.trail) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < c.trail.length; i++) {
      const a = c.trail[i - 1]!;
      const b = c.trail[i]!;
      ctx.globalAlpha = c.opacity * (i / c.trail.length) * 0.6;
      ctx.lineWidth = c.sizePx * 0.3 * (i / c.trail.length);
      ctx.strokeStyle = style.trail.color;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = c.opacity;
  }

  if (style.highlight) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, style.highlight.radiusPx * (c.sizePx / 30), 0, Math.PI * 2);
    ctx.fillStyle = style.highlight.color;
    ctx.fill();
  }

  if (style.glow) {
    ctx.shadowColor = style.clickColor;
    ctx.shadowBlur = c.sizePx * 0.8;
  } else if (style.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = c.sizePx * 0.18;
    ctx.shadowOffsetY = c.sizePx * 0.06;
  }

  const h = c.sizePx;
  if (style.style === 'dot' || style.style === 'ring') {
    ctx.beginPath();
    ctx.arc(c.x, c.y, h * 0.35, 0, Math.PI * 2);
    if (style.style === 'dot') {
      ctx.fillStyle = style.color;
      ctx.fill();
      ctx.lineWidth = h * 0.06;
      ctx.strokeStyle = style.outlineColor;
      ctx.stroke();
    } else {
      ctx.lineWidth = h * 0.1;
      ctx.strokeStyle = style.color;
      ctx.stroke();
    }
  } else if (c.shape === 'ibeam') {
    ctx.lineWidth = h * 0.08;
    ctx.strokeStyle = style.style === 'macosWhite' ? '#fff' : '#000';
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - h * 0.45);
    ctx.lineTo(c.x, c.y + h * 0.45);
    ctx.moveTo(c.x - h * 0.15, c.y - h * 0.45);
    ctx.lineTo(c.x + h * 0.15, c.y - h * 0.45);
    ctx.moveTo(c.x - h * 0.15, c.y + h * 0.45);
    ctx.lineTo(c.x + h * 0.15, c.y + h * 0.45);
    ctx.stroke();
  } else {
    const white = style.style === 'macosWhite';
    arrowPath(ctx, c.x, c.y, h);
    ctx.lineJoin = 'round';
    ctx.lineWidth = h * 0.08;
    ctx.strokeStyle = white ? '#000' : style.outlineColor;
    ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = white ? '#fff' : style.color;
    ctx.fill();
  }
  ctx.restore();
}
