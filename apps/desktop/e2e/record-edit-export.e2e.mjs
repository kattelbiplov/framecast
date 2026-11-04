/**
 * End-to-end smoke test against the *built* app (npm run build first):
 * records the screen with the Chromium engine, edits the generated project, exports through
 * the real ffmpeg pipeline and verifies the output with ffprobe.
 *
 *   npm run test:e2e            (on Linux CI wrap with: xvfb-run -a npm run test:e2e)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { _electron as electron } from 'playwright';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const electronBin = createRequire(import.meta.url)('electron');
const home = mkdtempSync(join(tmpdir(), 'framecast-e2e-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (cond, msg) => {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
};

const app = await electron.launch({
  executablePath: electronBin,
  args: ['--no-sandbox', appDir],
  env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config') },
});
const errors = [];
try {
  const win = await app.firstWindow();
  win.on('pageerror', (e) => errors.push(e.message));
  await win.waitForSelector('text=New recording');

  // Record 3 s with no audio devices (CI machines have none).
  await win.click('text=New recording');
  await win.waitForSelector('text=Start recording');
  for (const label of ['Record microphone', 'Record system audio']) {
    const el = win.locator(`[aria-label="${label}"]`);
    if ((await el.getAttribute('aria-checked')) === 'true') await el.click();
  }
  await win.click('[aria-label="Countdown"] >> text=Off');
  await win.click('[aria-label="Frame rate"] >> text=30');
  await win.click('button:has-text("Start recording")');
  await win.waitForFunction(async () => (await window.framecast.invoke('recording:state')).phase === 'recording', null, { timeout: 20_000 });
  // Real OS-level clicks (X11) when xdotool is available, to exercise click tracking → auto zoom.
  const xdotool = (() => {
    try {
      execFileSync('xdotool', ['version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();
  if (xdotool) {
    execFileSync('xdotool', ['mousemove', '900', '300']);
    await sleep(500);
    execFileSync('xdotool', ['click', '1']);
    await sleep(2500);
  } else {
    await sleep(3000);
  }
  await win.evaluate(() => window.framecast.invoke('recording:stop'));
  await win.waitForSelector('button:has-text("Export")', { timeout: 60_000 });

  // Edit: add a title and a caption, wait for autosave.
  await win.click('nav >> text=Text');
  await win.click('button:has-text("Title")');
  await win.click('nav >> text=Captions');
  await win.click('[aria-label="Add caption at playhead"]');
  await sleep(2500);

  const [entry] = await win.evaluate(() => window.framecast.invoke('library:list'));
  const opened = await win.evaluate((id) => window.framecast.invoke('project:open', id), entry.id);
  assert(opened.project.assets.some((a) => a.role === 'screen'), 'screen asset recorded');
  assert(opened.project.timeline.tracks.some((t) => t.kind === 'text' && t.items.length === 1), 'title added');
  assert(opened.project.subtitles[0]?.cues.length === 1, 'caption added');
  if (xdotool) {
    const clicks = opened.recordings[0].events.filter((e) => e.type === 'down');
    assert(clicks.length === 1, `click recorded (${clicks.length})`);
    const zooms = opened.project.timeline.tracks.find((t) => t.kind === 'zoom').items;
    assert(zooms.length >= 1 && zooms[0].start <= clicks[0].t && zooms[0].start + zooms[0].duration >= clicks[0].t, 'auto zoom generated around the click');
  }

  // The media protocol must support Range requests or <video> cannot seek.
  const seekable = await win.evaluate(async (url) => {
    const v = document.createElement('video');
    v.muted = true;
    v.src = url;
    await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }));
    v.currentTime = 1;
    await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
    return v.currentTime;
  }, Object.values(opened.mediaUrls)[0]);
  assert(Math.abs(seekable - 1) < 0.1, `recorded media is seekable (currentTime=${seekable})`);

  const end = Math.max(...opened.project.timeline.tracks.flatMap((t) => t.items.map((i) => i.start + i.duration)));
  const out = join(home, 'export.mp4');
  const settings = { ...opened.project.export, height: 720, fps: 30, quality: 'draft', hardwareAcceleration: false, exportSubtitleFile: 'srt' };
  await win.evaluate(([id, s, o, e]) => window.framecast.invoke('export:start', { projectId: id, settings: s, outputPath: o, range: { start: 0, end: e } }), [entry.id, settings, out, end]);
  let job;
  for (let i = 0; i < 240 && !(job && ['done', 'failed'].includes(job.status)); i++) {
    await sleep(500);
    job = (await win.evaluate(() => window.framecast.invoke('export:jobs'))).at(-1);
  }
  assert(job?.status === 'done', `export finished (${job?.status}: ${job?.error ?? ''})`);
  const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height', '-of', 'csv=p=0', out]).toString().trim();
  assert(probe === 'h264,1280,720', `output stream is h264 1280x720 (got ${probe})`);
  assert(existsSync(out.replace(/\.mp4$/, '.srt')), 'sidecar SRT written');
  assert(errors.length === 0, `no renderer errors (${errors.join('; ')})`);
  console.log(`✓ record → edit → export OK (${probe}, ${(end / 1000).toFixed(1)}s)`);
} finally {
  await app.close();
}
