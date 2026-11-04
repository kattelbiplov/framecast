import { unitProgress, type AnimationPose } from '@framecast/animation';
import type { TextNode } from '../scene.js';
import { fontString, roundRectPath, type Ctx2D } from './context.js';

interface Unit {
  text: string;
  x: number;
  line: number;
  index: number;
}

function splitUnits(ctx: Ctx2D, lines: string[], unit: AnimationPose['revealUnit']): Unit[] {
  const units: Unit[] = [];
  let index = 0;
  lines.forEach((line, li) => {
    const parts = unit === 'char' ? [...line] : unit === 'word' ? line.split(/(\s+)/) : [line];
    let x = 0;
    for (const part of parts) {
      if (part.length === 0) continue;
      const isSpace = /^\s+$/.test(part);
      if (!isSpace || unit === 'char') units.push({ text: part, x, line: li, index: index++ });
      x += ctx.measureText(part).width;
    }
  });
  return units;
}

export function drawText(ctx: Ctx2D, node: TextNode, W: number, H: number): void {
  const { item, pose } = node;
  const s = item.style;
  if (node.opacity <= 0.001) return;
  ctx.save();
  ctx.globalAlpha *= node.opacity;
  ctx.translate(node.x * W, node.y * H);
  if (node.rotationDeg) ctx.rotate((node.rotationDeg * Math.PI) / 180);
  if (node.scale !== 1) ctx.scale(node.scale, node.scale);
  if (pose.blurPx > 0.1) ctx.filter = `blur(${pose.blurPx}px)`;
  ctx.font = fontString(s.fontWeight, s.fontSizePx, s.fontFamily);
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D).letterSpacing = `${s.letterSpacingPx}px`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const lines = item.text.split('\n');
  const lineH = s.fontSizePx * s.lineHeight;
  const widths = lines.map((l) => ctx.measureText(l).width);
  const blockW = Math.max(...widths, 1);
  const blockH = lineH * lines.length;
  const lineX = (i: number) =>
    s.align === 'left' ? -blockW / 2 : s.align === 'right' ? blockW / 2 - widths[i]! : -widths[i]! / 2;
  const lineY = (i: number) => -blockH / 2 + lineH * (i + 0.5);

  if (s.background) {
    const p = s.backgroundPaddingPx;
    roundRectPath(ctx, -blockW / 2 - p, -blockH / 2 - p, blockW + p * 2, blockH + p * 2, s.backgroundRadiusPx);
    ctx.fillStyle = s.background;
    ctx.fill();
  }
  if (s.shadow) {
    ctx.shadowColor = s.shadow.color;
    ctx.shadowBlur = s.shadow.blurPx;
    ctx.shadowOffsetX = s.shadow.offsetX;
    ctx.shadowOffsetY = s.shadow.offsetY;
  }
  const paint = (text: string, x: number, y: number) => {
    if (s.stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = s.stroke.widthPx;
      ctx.strokeStyle = s.stroke.color;
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = s.color;
    ctx.fillText(text, x, y);
  };

  if (pose.revealUnit === 'none' && !pose.perUnit) {
    lines.forEach((l, i) => paint(l, lineX(i), lineY(i)));
  } else {
    const units = splitUnits(ctx, lines, pose.revealUnit === 'none' ? 'word' : pose.revealUnit);
    const n = units.length;
    for (const u of units) {
      const up = unitProgress(pose.reveal, u.index, n, pose.perUnit ? 0.6 : 0);
      if (up <= 0) continue;
      const x = lineX(u.line) + u.x;
      const y = lineY(u.line);
      if (!pose.perUnit) {
        paint(u.text, x, y);
        continue;
      }
      const d = pose.perUnit(up);
      const w = ctx.measureText(u.text).width;
      ctx.save();
      ctx.globalAlpha *= d.opacity ?? 1;
      ctx.translate(x + w / 2 + (d.dx ?? 0) * W, y + (d.dy ?? 0) * H);
      const sc = d.scale ?? 1;
      ctx.scale(sc, sc);
      paint(u.text, -w / 2, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}
