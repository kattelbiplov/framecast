import { shell, systemPreferences } from 'electron';
import type { PermissionKind, PermissionState, PermissionStatus } from '../../shared/ipc.js';

const SETTINGS_URL: Record<PermissionKind, string> = {
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  camera: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
};

const isMac = process.platform === 'darwin';

function mediaStatus(kind: 'screen' | 'microphone' | 'camera'): PermissionState {
  if (!isMac && process.platform !== 'win32') return 'granted';
  const s = systemPreferences.getMediaAccessStatus(kind);
  return s === 'granted' || s === 'denied' || s === 'not-determined' || s === 'restricted' ? s : 'unknown';
}

/** macOS privacy (TCC) permissions. Other platforms report 'granted' (no OS-level gate). */
export const permissions = {
  status(): PermissionStatus {
    return {
      screen: mediaStatus('screen'),
      microphone: mediaStatus('microphone'),
      camera: mediaStatus('camera'),
      // Accessibility is needed by the native helper's CGEventTap for click/shortcut tracking.
      accessibility: isMac ? (systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'denied') : 'granted',
    };
  },

  async request(kind: PermissionKind): Promise<PermissionState> {
    if (!isMac) return 'granted';
    if (kind === 'microphone' || kind === 'camera') {
      return (await systemPreferences.askForMediaAccess(kind)) ? 'granted' : 'denied';
    }
    if (kind === 'accessibility') {
      return systemPreferences.isTrustedAccessibilityClient(true) ? 'granted' : 'denied';
    }
    // Screen recording cannot be requested programmatically; macOS prompts on first capture.
    await shell.openExternal(SETTINGS_URL.screen);
    return mediaStatus('screen');
  },

  async openSettings(kind: PermissionKind): Promise<void> {
    if (isMac) await shell.openExternal(SETTINGS_URL[kind]);
  },
};
