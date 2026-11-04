/// <reference types="vite/client" />
import type { FramecastBridge } from '../../shared/ipc';

declare global {
  interface Window {
    framecast: FramecastBridge;
  }
}
