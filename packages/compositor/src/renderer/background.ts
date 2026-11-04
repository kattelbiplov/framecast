import type { Background } from '@framecast/schema';
import { intrinsicSize, type Ctx2D, type FrameSources } from './context.js';

export function drawBackground(
  ctx: Ctx2D, bg: Background, angleDeg: number, W: number, H: number, sources: FrameSources, t: number,
): void {
  switch (bg.type) {
    case 'solid':
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, W, H);
      return;
    case 'gradient': {
      const a = (angleDeg * Math.PI) / 180;
      const half = (Math.abs(W * Math.sin(a)) + Math.abs(H * Math.cos(a))) / 2;
      const cx = W / 2;
      const cy = H / 2;
      const g = ctx.createLinearGradient(cx - Math.sin(a) * half, cy + Math.cos(a) * half, cx + Math.sin(a) * half, cy - Math.cos(a) * half);
      for (const s of bg.stops) g.addColorStop(s.offset, s.color);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      return;
    }
    case 'pattern': {
      ctx.fillStyle = bg.background;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = bg.color;
      ctx.strokeStyle = bg.color;
      ctx.lineWidth = 1;
      const s = bg.spacingPx;
      if (bg.pattern === 'dots') {
        for (let y = s / 2; y < H; y += s) for (let x = s / 2; x < W; x += s) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      } else {
        ctx.beginPath();
        if (bg.pattern === 'grid') {
          for (let x = 0; x <= W; x += s) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
          for (let y = 0; y <= H; y += s) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
        } else {
          for (let x = -H; x <= W; x += s) { ctx.moveTo(x, H); ctx.lineTo(x + H, 0); }
        }
        ctx.stroke();
      }
      return;
    }
    case 'image':
    case 'video': {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, W, H);
      const img = sources.frame(bg.assetId, t);
      if (!img) return;
      const { width: iw, height: ih } = intrinsicSize(img);
      if (!iw || !ih) return;
      const scale = Math.max(W / iw, H / ih) * (bg.blurPx > 0 ? 1.1 : 1); // overscan hides blur edges
      ctx.save();
      if (bg.blurPx > 0) ctx.filter = `blur(${bg.blurPx}px)`;
      ctx.drawImage(img, (W - iw * scale) / 2, (H - ih * scale) / 2, iw * scale, ih * scale);
      ctx.restore();
    }
  }
}
