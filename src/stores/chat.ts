import { create } from 'zustand';

interface ChatStore {
  pendingMessage: string | null;
  setPendingMessage: (msg: string) => void;
  clearPendingMessage: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  pendingMessage: null,
  setPendingMessage: (msg) => set({ pendingMessage: msg }),
  clearPendingMessage: () => set({ pendingMessage: null }),
}));
