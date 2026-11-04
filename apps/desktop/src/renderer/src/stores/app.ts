import type { AppSettings } from '@framecast/schema';
import { create } from 'zustand';
import type { AppInfo } from '../../../shared/ipc';
import { invoke } from '../lib/ipc';

export type Route = { name: 'home' } | { name: 'setup' } | { name: 'editor'; projectId: string };

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  message: string;
}

interface AppStore {
  route: Route;
  info: AppInfo | null;
  settings: AppSettings | null;
  toasts: Toast[];
  settingsOpen: boolean;
  navigate(route: Route): void;
  toast(kind: Toast['kind'], message: string): void;
  dismissToast(id: number): void;
  init(): Promise<void>;
  updateSettings(patch: Partial<AppSettings>): Promise<void>;
  setSettingsOpen(open: boolean): void;
}

let toastId = 0;

function applyTheme(theme: AppSettings['theme']): void {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export const useApp = create<AppStore>((set, get) => ({
  route: { name: 'home' },
  info: null,
  settings: null,
  toasts: [],
  settingsOpen: false,
  navigate: (route) => set({ route }),
  toast: (kind, message) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message }] }));
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 7000 : 3500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  init: async () => {
    const [info, settings] = await Promise.all([invoke('app:info'), invoke('settings:get')]);
    applyTheme(settings.theme);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(get().settings?.theme ?? 'system'));
    set({ info, settings });
  },
  updateSettings: async (patch) => {
    const settings = await invoke('settings:update', patch);
    applyTheme(settings.theme);
    set({ settings });
  },
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}));

export const toast = (kind: Toast['kind'], message: string) => useApp.getState().toast(kind, message);
