import type { CaptionNode } from '../scene.js';
import { fontString, roundRectPath, type Ctx2D } from './context.js';

export function drawCaption(ctx: Ctx2D, node: CaptionNode, W: number, H: number): void {
  const { frame, style } = node;
  if (frame.opacity <= 0.001 || frame.lines.length === 0) return;
  ctx.save();
  ctx.globalAlpha *= frame.opacity;
  ctx.font = fontString(style.fontWeight, style.fontSizePx, style.fontFamily);
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D).letterSpacing = `${style.letterSpacingPx}px`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const space = ctx.measureText(' ').width;
  const lineH = style.fontSizePx * style.lineSpacing;
  const maxW = W * (1 - style.safeAreaX * 2);

  const measured = frame.lines.map((line) => {
    const widths = line.map((w) => ctx.measureText(w.text).width);
    const total = widths.reduce((a, b) => a + b, 0) + space * Math.max(0, line.length - 1);
    return { line, widths, total };
  });
  const blockW = Math.min(maxW, Math.max(...measured.map((m) => m.total)));
  const blockH = lineH * measured.length;
  const cx = style.align === 'left' ? W * style.safeAreaX + blockW / 2 : style.align === 'right' ? W * (1 - style.safeAreaX) - blockW / 2 : W / 2;
  const cy = style.positionY * H + frame.dy * style.fontSizePx;

  ctx.translate(cx, cy);
  if (frame.scale !== 1) ctx.scale(frame.scale, frame.scale);
  // Fit very long lines inside the safe area.
  const longest = Math.max(...measured.map((m) => m.total));
  if (longest > maxW) ctx.scale(maxW / longest, maxW / longest);

  if (style.backgroundColor) {
    const pad = style.fontSizePx * 0.35;
    roundRectPath(ctx, -blockW / 2 - pad, -blockH / 2 - pad * 0.6, blockW + pad * 2, blockH + pad * 1.2, style.fontSizePx * 0.3);
    ctx.fillStyle = style.backgroundColor;
    ctx.fill();
  }
  if (style.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = style.fontSizePx * 0.25;
    ctx.shadowOffsetY = style.fontSizePx * 0.06;
  }

  measured.forEach(({ line, widths, total }, li) => {
    const startX = style.align === 'left' ? -blockW / 2 : style.align === 'right' ? blockW / 2 - total : -total / 2;
    const y = -blockH / 2 + lineH * (li + 0.5);
    let x = startX;
    line.forEach((word, wi) => {
      const w = widths[wi]!;
      const text = Number.isFinite(word.visibleChars) ? [...word.text].slice(0, word.visibleChars).join('') : word.text;
      if (text.length > 0 && word.opacity > 0.001) {
        ctx.save();
        ctx.globalAlpha *= word.opacity;
        ctx.translate(x + w / 2, y + word.dy * style.fontSizePx);
        if (word.scale !== 1) ctx.scale(word.scale, word.scale);
        const ox = -w / 2;
        if (style.stroke) {
          ctx.lineJoin = 'round';
          ctx.lineWidth = style.stroke.widthPx;
          ctx.strokeStyle = style.stroke.color;
          ctx.strokeText(text, ox, 0);
        }
        const karaoke = style.preset === 'karaoke';
        ctx.fillStyle = word.highlighted && !karaoke ? style.activeWordColor : style.textColor;
        ctx.fillText(text, ox, 0);
        if (karaoke && word.fill > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(ox, -style.fontSizePx, w * word.fill, style.fontSizePx * 2);
          ctx.clip();
          ctx.shadowColor = 'transparent';
          ctx.fillStyle = style.activeWordColor;
          ctx.fillText(text, ox, 0);
          ctx.restore();
        }
        ctx.restore();
      }
      x += w + space;
    });
  });
  ctx.restore();
}
