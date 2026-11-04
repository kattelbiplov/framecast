import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { EVENT_CHANNELS, INVOKE_CHANNELS, type FramecastBridge } from '../shared/ipc.js';

const invokeAllowed = new Set<string>(INVOKE_CHANNELS);
const eventsAllowed = new Set<string>(EVENT_CHANNELS);

/**
 * The only surface the sandboxed renderer can use. Channels are allow-listed; raw ipcRenderer
 * is never exposed.
 */
const bridge: FramecastBridge = {
  invoke: (channel, ...args) => {
    if (!invokeAllowed.has(channel)) return Promise.reject(new Error(`Blocked IPC channel ${channel}`));
    return ipcRenderer.invoke(channel, ...args).catch((e: Error) => {
      // Electron prefixes remote errors; strip it for display.
      throw new Error(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    });
  },
  on: (channel, listener) => {
    if (!eventsAllowed.has(channel)) throw new Error(`Blocked IPC event ${channel}`);
    const wrapped = (_e: IpcRendererEvent, payload: unknown) => listener(payload as never);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
};

contextBridge.exposeInMainWorld('framecast', bridge);
