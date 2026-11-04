import type { InteractionEvent } from '@framecast/schema';
import { screen, systemPreferences } from 'electron';
import { createLogger } from '../../lib/logger.js';
import type { TrackerClock } from './cursor-tracker.js';

const log = createLogger('click-tracker');

import type * as UiohookModule from 'uiohook-napi';
import type { UiohookKeyboardEvent, UiohookMouseEvent, UiohookWheelEvent } from 'uiohook-napi';

type Hook = typeof UiohookModule;
let hookModule: Hook | null | undefined;

/** Load the native hook lazily; a missing or broken binary must never break recording. */
function loadHook(): Hook | null {
  if (hookModule !== undefined) return hookModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    hookModule = require('uiohook-napi') as Hook;
  } catch (e) {
    log.warn('uiohook-napi unavailable; clicks will not be tracked', e);
    hookModule = null;
  }
  return hookModule;
}

const BUTTONS: Record<number, 'left' | 'right' | 'middle'> = { 1: 'left', 2: 'right', 3: 'middle' };

export interface ClickTrackerOptions {
  bounds: { x: number; y: number; width: number; height: number };
  clock: TrackerClock;
  emit: (e: InteractionEvent) => void;
  trackShortcuts: boolean;
}

/**
 * Global mouse-button, scroll and shortcut tracking for the Chromium engine (the native
 * helper uses its own CGEventTap). Positions come from Electron's cursor point so they share
 * a coordinate space with the polling movement tracker. Plain typing is never recorded:
 * key events are emitted only while ⌘/⌃/⌥ is held.
 */
export class ClickTracker {
  private hook: Hook | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly opts: ClickTrackerOptions) {}

  /** Returns false when clicks cannot be tracked (module missing or permission denied). */
  start(): boolean {
    if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false)) {
      log.warn('Accessibility permission not granted; clicks will not be tracked');
      return false;
    }
    const mod = loadHook();
    if (!mod) return false;
    const { uIOhook, UiohookKey } = mod;
    const keyNames = new Map<number, string>(Object.entries(UiohookKey).map(([name, code]) => [code as number, name]));
    const point = () => {
      const p = screen.getCursorScreenPoint();
      const b = this.opts.bounds;
      return { x: round4((p.x - b.x) / b.width), y: round4((p.y - b.y) / b.height) };
    };
    const at = () => {
      const t = this.opts.clock.now();
      return t === null ? null : Math.round(t);
    };
    const onMouse = (kind: 'down' | 'up') => (e: UiohookMouseEvent) => {
      const t = at();
      const button = BUTTONS[e.button as number];
      if (t !== null && button) this.opts.emit({ type: kind, t, button, ...point() });
    };
    const onDown = onMouse('down');
    const onUp = onMouse('up');
    const onWheel = (e: UiohookWheelEvent) => {
      const t = at();
      if (t === null) return;
      const vertical = e.direction === 3;
      this.opts.emit({ type: 'scroll', t, dx: vertical ? 0 : e.rotation, dy: vertical ? e.rotation : 0, ...point() });
    };
    const onKey = (e: UiohookKeyboardEvent) => {
      const t = at();
      if (t === null || !(e.metaKey || e.ctrlKey || e.altKey)) return; // privacy: never plain typing
      const key = keyNames.get(e.keycode) ?? `Key${e.keycode}`;
      if (/^(Meta|Ctrl|Alt|Shift)/.test(key)) return; // a lone modifier press is not a shortcut
      const modifiers: ('cmd' | 'ctrl' | 'alt' | 'shift')[] = [];
      if (e.metaKey) modifiers.push('cmd');
      if (e.ctrlKey) modifiers.push('ctrl');
      if (e.altKey) modifiers.push('alt');
      if (e.shiftKey) modifiers.push('shift');
      this.opts.emit({ type: 'shortcut', t, key: key.slice(0, 16), modifiers });
    };
    uIOhook.on('mousedown', onDown);
    uIOhook.on('mouseup', onUp);
    uIOhook.on('wheel', onWheel);
    if (this.opts.trackShortcuts) uIOhook.on('keydown', onKey);
    this.unsubscribe = () => {
      uIOhook.removeListener('mousedown', onDown);
      uIOhook.removeListener('mouseup', onUp);
      uIOhook.removeListener('wheel', onWheel);
      uIOhook.removeListener('keydown', onKey);
    };
    try {
      uIOhook.start();
    } catch (e) {
      log.warn('Could not start global input hook', e);
      this.unsubscribe?.();
      this.unsubscribe = null;
      return false;
    }
    this.hook = mod;
    return true;
  }

  stop(): void {
    if (!this.hook) return;
    const { uIOhook } = this.hook;
    this.unsubscribe?.();
    this.unsubscribe = null;
    try {
      uIOhook.stop();
    } catch (e) {
      log.warn('Error stopping input hook', e);
    }
    this.hook = null;
  }
}

const round4 = (v: number) => Math.round(v * 10000) / 10000;
