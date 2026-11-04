import { clamp, ease, lerp, unitProgress } from '@framecast/animation';
import { SUBSCRIBE_CLICK_AT, counterValue, graphicIntro, progressFill } from '../graphics.js';
import type { GraphicNode } from '../scene.js';
import { fontString, roundRectPath, type Ctx2D } from './context.js';

/** Draw a parametric motion graphic. All sizes derive from the node box so it scales cleanly. */
export function drawGraphic(ctx: Ctx2D, node: GraphicNode): void {
  if (node.opacity <= 0.001) return;
  const { box, item } = node;
  ctx.save();
  ctx.globalAlpha *= node.opacity;
  if (node.rotationDeg) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((node.rotationDeg * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  if (node.pose.blurPx > 0.1) ctx.filter = `blur(${node.pose.blurPx}px)`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const intro = graphicIntro(node.localT);
  const u = box.height; // unit used for proportional sizing
  const font = (w: number, px: number) => fontString(w, px, item.fontFamily);

  switch (item.kind) {
    case 'lowerThird': {
      // Accent bar grows, then the plate slides out from it and the text fades up.
      const barW = u * 0.08;
      const barP = ease('easeOutCubic', clamp(node.localT / 350));
      const plateP = ease('easeOutCubic', clamp((node.localT - 200) / 600));
      ctx.fillStyle = item.primaryColor;
      ctx.fillRect(box.x, box.y + (box.height * (1 - barP)) / 2, barW, box.height * barP);
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.x + barW, box.y, (box.width - barW) * plateP, box.height);
      ctx.clip();
      ctx.fillStyle = 'rgba(15,15,25,0.86)';
      ctx.fillRect(box.x + barW, box.y, box.width - barW, box.height);
      const textP = ease('easeOutCubic', clamp((node.localT - 450) / 450));
      ctx.globalAlpha *= textP;
      ctx.fillStyle = item.textColor;
      ctx.font = font(800, u * 0.32);
      ctx.fillText(item.title, box.x + barW + u * 0.22, box.y + u * 0.36 + (1 - textP) * u * 0.15, box.width - u * 0.4);
      ctx.fillStyle = item.secondaryColor;
      ctx.globalAlpha *= 0.8;
      ctx.font = font(500, u * 0.2);
      ctx.fillText(item.subtitle, box.x + barW + u * 0.22, box.y + u * 0.7 + (1 - textP) * u * 0.15, box.width - u * 0.4);
      ctx.restore();
      break;
    }
    case 'progressBar': {
      const r = box.height / 2;
      roundRectPath(ctx, box.x, box.y, box.width, box.height, r);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fill();
      const fill = progressFill(node.localT, node.duration);
      if (fill > 0) {
        roundRectPath(ctx, box.x, box.y, Math.max(box.height, box.width * fill), box.height, r);
        ctx.fillStyle = item.primaryColor;
        ctx.fill();
      }
      if (item.title) {
        ctx.font = font(600, Math.max(12, box.height * 1.4));
        ctx.fillStyle = item.textColor;
        ctx.fillText(item.title, box.x, box.y - box.height * 1.3);
      }
      break;
    }
    case 'notification': {
      ctx.save();
      ctx.translate(0, (1 - intro) * -u * 0.6);
      ctx.globalAlpha *= intro;
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = u * 0.25;
      ctx.shadowOffsetY = u * 0.06;
      roundRectPath(ctx, box.x, box.y, box.width, box.height, u * 0.2);
      ctx.fillStyle = 'rgba(246,246,248,0.97)';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      const icon = u * 0.42;
      roundRectPath(ctx, box.x + u * 0.18, box.y + (u - icon) / 2, icon, icon, icon * 0.24);
      ctx.fillStyle = item.primaryColor;
      ctx.fill();
      ctx.font = font(800, icon * 0.5);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText((item.title[0] ?? '•').toUpperCase(), box.x + u * 0.18 + icon / 2, box.y + u / 2);
      ctx.textAlign = 'left';
      const tx = box.x + u * 0.18 + icon + u * 0.16;
      ctx.fillStyle = '#111118';
      ctx.font = font(700, u * 0.19);
      ctx.fillText(item.title, tx, box.y + u * 0.36, box.width - (tx - box.x) - u * 0.2);
      ctx.fillStyle = '#55555f';
      ctx.font = font(500, u * 0.16);
      ctx.fillText(item.subtitle, tx, box.y + u * 0.64, box.width - (tx - box.x) - u * 0.2);
      ctx.restore();
      break;
    }
    case 'barChart': {
      const values = item.values.length ? item.values : [3, 5, 4, 7];
      const max = Math.max(...values, 1);
      const titleH = item.title ? u * 0.14 : 0;
      if (item.title) {
        ctx.font = font(700, u * 0.08);
        ctx.fillStyle = item.textColor;
        ctx.globalAlpha *= intro;
        ctx.fillText(item.title, box.x, box.y + titleH / 2);
        ctx.globalAlpha /= Math.max(intro, 1e-3);
      }
      const labelH = u * 0.1;
      const chartTop = box.y + titleH;
      const chartH = box.height - titleH - labelH;
      const gap = box.width * 0.04;
      const barW = (box.width - gap * (values.length - 1)) / values.length;
      const sweep = clamp(node.localT / 1200);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = Math.max(1, u * 0.004);
      ctx.beginPath();
      ctx.moveTo(box.x, chartTop + chartH);
      ctx.lineTo(box.x + box.width, chartTop + chartH);
      ctx.stroke();
      values.forEach((v, i) => {
        const p = ease('easeOutBack', unitProgress(sweep, i, values.length, 0.5));
        const h = (v / max) * chartH * Math.max(0, p);
        const x = box.x + i * (barW + gap);
        roundRectPath(ctx, x, chartTop + chartH - h, barW, h, Math.min(barW * 0.15, h / 2));
        ctx.fillStyle = i === values.length - 1 ? item.primaryColor : mix(item.primaryColor, 0.55);
        ctx.fill();
        ctx.font = font(700, u * 0.06);
        ctx.textAlign = 'center';
        ctx.fillStyle = item.textColor;
        if (p > 0.6) ctx.fillText(formatNumber(v), x + barW / 2, chartTop + chartH - h - u * 0.04);
        ctx.font = font(500, u * 0.055);
        ctx.globalAlpha *= 0.8;
        ctx.fillText(item.labels[i] ?? '', x + barW / 2, chartTop + chartH + labelH / 2);
        ctx.globalAlpha /= 0.8;
        ctx.textAlign = 'left';
      });
      break;
    }
    case 'subscribe': {
      const clickT = node.duration * SUBSCRIBE_CLICK_AT;
      const clicked = node.localT >= clickT;
      const press = clicked ? 1 - 0.08 * Math.sin(Math.PI * clamp((node.localT - clickT) / 250)) : 1;
      const w = box.width * lerp(0.6, 1, intro) * press;
      const h = box.height * press;
      const x = box.x + (box.width - w) / 2;
      const y = box.y + (box.height - h) / 2;
      roundRectPath(ctx, x, y, w, h, h / 2);
      ctx.fillStyle = clicked ? '#3f3f46' : item.primaryColor === '#6366f1' ? '#ef4444' : item.primaryColor;
      ctx.fill();
      ctx.font = font(800, h * 0.32);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.globalAlpha *= intro;
      ctx.fillText(clicked ? `✓ ${item.subtitle || 'SUBSCRIBED'}` : item.title || 'SUBSCRIBE', box.x + box.width / 2, box.y + box.height / 2, w * 0.9);
      if (clicked) {
        const rp = clamp((node.localT - clickT) / 500);
        ctx.globalAlpha = node.opacity * (1 - rp);
        ctx.beginPath();
        ctx.arc(box.x + box.width * 0.72, box.y + box.height * 0.6, h * (0.2 + rp * 0.8), 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = h * 0.05;
        ctx.stroke();
      }
      break;
    }
    case 'counter': {
      const value = counterValue(item, node.localT);
      ctx.textAlign = 'center';
      ctx.fillStyle = item.primaryColor;
      ctx.font = font(900, u * 0.5);
      ctx.fillText(`${item.labels[0] ?? ''}${formatNumber(value)}${item.labels[1] ?? ''}`, box.x + box.width / 2, box.y + u * 0.38);
      ctx.fillStyle = item.textColor;
      ctx.globalAlpha *= intro;
      ctx.font = font(600, u * 0.13);
      ctx.fillText(item.title, box.x + box.width / 2, box.y + u * 0.8, box.width);
      break;
    }
  }
  ctx.restore();
}

function formatNumber(v: number): string {
  return v.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

/** Blend a #rrggbb colour toward transparent-ish by lowering alpha (for secondary bars). */
function mix(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
