import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
  fromHistory?: boolean; // true if loaded from Supabase
}

interface PortfolioContext {
  account: {
    total_equity: number;
    positions_value: number;
    cash: number;
    day_pnl: number;
    buying_power: number;
  };
  positions: Array<{
    symbol: string;
    qty: number;
    market_value: number;
    unrealized_pl: number;
    unrealized_plpc: number;
    current_price: number;
  }>;
  positions_count: number;
  orders: any[];
}

interface AdvisorStore {
  messages: ChatMessage[];
  isLoading: boolean;
  portfolioContext: PortfolioContext | null;
  alpacaAccountId: string | null;
  historyLoaded: boolean;

  setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  clearMessages: () => void;
  setIsLoading: (loading: boolean) => void;
  setPortfolioContext: (ctx: PortfolioContext | null) => void;
  setAlpacaAccountId: (id: string | null) => void;
  setHistoryLoaded: (loaded: boolean) => void;
}

export const useAdvisorStore = create<AdvisorStore>((set) => ({
  messages: [
    {
      id: 'welcome',
      role: 'ai',
      content: 'Your portfolio is loaded. Ask me anything about your positions, strategies, or market conditions.',
      timestamp: new Date(),
    },
  ],
  isLoading: false,
  portfolioContext: null,
  alpacaAccountId: null,
  historyLoaded: false,

  setMessages: (updater) =>
    set((state) => ({
      messages: typeof updater === 'function' ? updater(state.messages) : updater,
    })),

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  updateMessage: (id, patch) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),

  clearMessages: () =>
    set({
      messages: [
        {
          id: 'welcome',
          role: 'ai',
          content: 'Your portfolio is loaded. Ask me anything about your positions, strategies, or market conditions.',
          timestamp: new Date(),
        },
      ],
    }),

  setIsLoading: (loading) => set({ isLoading: loading }),
  setPortfolioContext: (ctx) => set({ portfolioContext: ctx }),
  setAlpacaAccountId: (id) => set({ alpacaAccountId: id }),
  setHistoryLoaded: (loaded) => set({ historyLoaded: loaded }),
}));
