
import { create } from 'zustand';

interface AdminPanelState {
  activeTab: string;
  setInitialTab: (tab: string) => void;
  setActiveTab: (tabName: string) => void;
}

export const useAdminPanelStore = create<AdminPanelState>((set) => ({
  activeTab: 'users', // Default initial tab
  setInitialTab: (tab) => {
    // This function will be called by AdminPageClientContent
    // to set the tab based on URL query parameters upon component mount.
    if (tab) {
      set({ activeTab: tab });
    }
  },
  setActiveTab: (tabName: string) => set({ activeTab: tabName }),
}));
