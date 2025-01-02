import { create } from 'zustand';

export interface SettingsState {
  autoDetectEnabled: boolean;
  downloadPath: string;
  notificationsEnabled: boolean;
  preferredQuality: 'best' | 'smallest' | 'ask';
  toggleAutoDetect: () => void;
  toggleNotifications: () => void;
  setDownloadPath: (path: string) => void;
  setPreferredQuality: (q: 'best' | 'smallest' | 'ask') => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  autoDetectEnabled: true,
  downloadPath: 'Downloads',
  notificationsEnabled: true,
  preferredQuality: 'best',
  toggleAutoDetect: () =>
    set((s) => ({ autoDetectEnabled: !s.autoDetectEnabled })),
  toggleNotifications: () =>
    set((s) => ({ notificationsEnabled: !s.notificationsEnabled })),
  setDownloadPath: (path) => set({ downloadPath: path }),
  setPreferredQuality: (q) => set({ preferredQuality: q }),
}));
