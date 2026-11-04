import { Composition, composeFrame, renderScene, type RenderTarget } from '@framecast/compositor';
import { invoke } from '../lib/ipc';
import { MediaPool, seekExact, whenReady } from '../playback/media-pool';

/**
 * Runs inside the hidden export window. For every output frame: evaluate the scene, seek each
 * required media element to the exact source time, render with the shared compositor, and hand
 * the RGBA pixels to the main process (which pipes them into ffmpeg).
 */
export async function runExport(jobId: string): Promise<void> {
  try {
    const job = await invoke('export:renderJob', jobId);
    const { opened, size, fps, range } = job;
    // Captions are burned in only when both the export setting and the track allow it.
    const project = {
      ...opened.project,
      export: job.settings,
      subtitles: opened.project.subtitles.map((s) => ({ ...s, visible: s.visible && s.burnIn && job.settings.burnSubtitles })),
    };
    const recordings = new Map(opened.recordings.map((r) => [r.id, r]));
    const comp = new Composition(project, recordings);
    const pool = new MediaPool(opened.mediaUrls, new Map(project.assets.map((a) => [a.id, a])));
    await document.fonts.ready;

    const canvas = new OffscreenCanvas(size.width, size.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const target: RenderTarget = {
      ctx, width: size.width, height: size.height,
      createScratch: (w, h) => {
        const c = new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
        return { canvas: c, ctx: c.getContext('2d')! };
      },
    };

    const total = Math.ceil(((range.end - range.start) / 1000) * fps);
    for (let i = 0; i < total; i++) {
      const t = range.start + (i * 1000) / fps;
      const scene = composeFrame(comp, t);
      const needs: [string, number][] = [];
      for (const l of scene.screen?.layers ?? []) needs.push([l.assetId, l.sourceTime]);
      if (scene.webcam) needs.push([scene.webcam.assetId, scene.webcam.sourceTime]);
      for (const o of scene.overlays) if (o.kind === 'video') needs.push([o.assetId, o.sourceTime]);
      if (scene.background.type === 'video') needs.push([scene.background.assetId, t]);
      for (const o of scene.overlays) if (o.kind === 'shape' && o.item.assetId) needs.push([o.item.assetId, 0]);
      if (scene.background.type === 'image') needs.push([scene.background.assetId, 0]);
      for (const [assetId, ms] of needs) {
        const el = pool.get(assetId);
        if (!el) continue;
        await whenReady(el);
        if (!(el instanceof HTMLImageElement)) await seekExact(el, ms / 1000, 0.5 / fps);
      }
      renderScene(target, scene, { frame: (id) => pool.frame(id) });
      const pixels = ctx.getImageData(0, 0, size.width, size.height).data;
      await invoke('export:frame', jobId, new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength));
    }
    pool.dispose();
    await invoke('export:framesDone', jobId);
  } catch (e) {
    await invoke('export:frameError', jobId, e instanceof Error ? e.message : String(e));
  }
}
