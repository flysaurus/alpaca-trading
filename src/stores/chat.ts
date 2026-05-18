import { create } from 'zustand';

interface ChatStore {
  pendingMessage: string | null;
  chatExpanded: boolean;
  setPendingMessage: (msg: string) => void;
  clearPendingMessage: () => void;
  setChatExpanded: (expanded: boolean) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  pendingMessage: null,
  chatExpanded: false,
  setPendingMessage: (msg) => set({ pendingMessage: msg }),
  clearPendingMessage: () => set({ pendingMessage: null }),
  setChatExpanded: (expanded) => set({ chatExpanded: expanded }),
}));
