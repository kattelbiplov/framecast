import type { EventChannel, EventChannels, FramecastBridge, InvokeArgs, InvokeChannel, InvokeResult } from '../../../shared/ipc';

let bridge: FramecastBridge | null = null;

/** Returns the preload bridge, or a dev mock when the UI runs in a plain browser. */
async function getBridge(): Promise<FramecastBridge> {
  if (bridge) return bridge;
  if (typeof window !== 'undefined' && window.framecast) bridge = window.framecast;
  else {
    const { createMockBridge } = await import('./mock-bridge');
    bridge = createMockBridge();
  }
  return bridge;
}

export function invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<Awaited<InvokeResult<C>>> {
  return getBridge().then((b) => b.invoke(channel, ...args));
}

export function subscribe<C extends EventChannel>(channel: C, listener: (payload: EventChannels[C]) => void): () => void {
  let off: (() => void) | null = null;
  let cancelled = false;
  void getBridge().then((b) => {
    if (!cancelled) off = b.on(channel, listener);
  });
  return () => {
    cancelled = true;
    off?.();
  };
}

export const isElectron = () => typeof window !== 'undefined' && !!window.framecast;
