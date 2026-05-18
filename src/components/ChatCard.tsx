'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Brain, Send, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useAdvisorStore } from '@/stores/advisorStore';
import { useChatStore } from '@/stores/chat';
import { fetchAiSuggestions, createAiSuggestion } from '@/lib/supabase';

/* ── Stable anonymous user ID ──────────────────────────────────── */
function getUserId(): string {
  const key = 'alpaca-dashboard-user-id';
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(key) || '';
  if (!id) {
    id = 'user-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem(key, id);
  }
  return id;
}

interface ChatCardProps {
  isExpanded: boolean;
  setExpanded: (v: boolean) => void;
  alpacaAccountId: string | null;
}

export default function ChatCard({ isExpanded, setExpanded, alpacaAccountId }: ChatCardProps) {
  const messages = useAdvisorStore((s) => s.messages);
  const setMessages = useAdvisorStore((s) => s.setMessages);
  const addMessage = useAdvisorStore((s) => s.addMessage);
  const updateMessage = useAdvisorStore((s) => s.updateMessage);
  const isLoading = useAdvisorStore((s) => s.isLoading);
  const setIsLoading = useAdvisorStore((s) => s.setIsLoading);
  const portfolioContext = useAdvisorStore((s) => s.portfolioContext);
  const historyLoaded = useAdvisorStore((s) => s.historyLoaded);

  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const userId = getUserId();

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Pre-fill input from Zustand store when expanded
  useEffect(() => {
    const { pendingMessage } = useChatStore.getState();
    if (isExpanded && pendingMessage) {
      setInput(pendingMessage);
      useChatStore.getState().clearPendingMessage();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isExpanded]);

  // Listen for position analysis requests from Positions tab
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const prompt = e.detail?.prompt;
      if (!prompt) return;
      const currentMessages = useAdvisorStore.getState().messages;
      if (currentMessages.length === 1 && currentMessages[0].id === 'welcome') {
        setMessages([]);
      }
      setInput(prompt);
      setTimeout(() => inputRef.current?.focus(), 100);
    };
    window.addEventListener('ai-analyze-position', handler as EventListener);
    return () => window.removeEventListener('ai-analyze-position', handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load cross-session history on first expand
  useEffect(() => {
    if (historyLoaded || !isExpanded) return;

    async function loadHistory() {
      try {
        const suggestions = await fetchAiSuggestions(userId, 10);
        if (suggestions.length === 0) {
          useAdvisorStore.getState().setHistoryLoaded(true);
          return;
        }

        const reversed = [...suggestions].reverse();
        const historyMessages = reversed.flatMap((s) => [
          {
            id: `h-prompt-${s.id}`,
            role: 'user' as const,
            content: s.prompt,
            timestamp: new Date(s.created_at),
            fromHistory: true,
          },
          {
            id: `h-resp-${s.id}`,
            role: 'ai' as const,
            content: s.response,
            timestamp: new Date(s.created_at),
            fromHistory: true,
          },
        ]);

        setMessages((prev) => {
          const welcome = prev.find((m) => m.id === 'welcome');
          const newMsgs = prev.filter((m) => m.id !== 'welcome' && !m.fromHistory);
          return [welcome || prev[0], ...historyMessages, ...newMsgs];
        });
      } catch (err) {
        console.error('[Advisor] Failed to load history:', err);
      } finally {
        useAdvisorStore.getState().setHistoryLoaded(true);
      }
    }

    loadHistory();
  }, [historyLoaded, isExpanded, userId, setMessages]);

  const saveToSupabase = async (prompt: string, response: string) => {
    if (!alpacaAccountId) return;
    try {
      await createAiSuggestion({
        user_id: userId,
        prompt,
        response,
        context: portfolioContext || {},
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Advisor] Failed to save to Supabase:', err);
    }
  };

  const handleChipClick = (chipText: string) => {
    const currentMessages = useAdvisorStore.getState().messages;
    if (currentMessages.length === 1 && currentMessages[0].id === 'welcome') {
      setMessages([]);
    }
    sendMessage(chipText);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg = {
      id: `u-${Date.now()}`,
      role: 'user' as const,
      content: text.trim(),
      timestamp: new Date(),
    };

    addMessage(userMsg);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      const history = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const payload = {
        message: text.trim(),
        portfolioContext: portfolioContext || {},
        conversation_history: history,
      };

      const res = await fetch('/api/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let aiContent = '';
      const aiId = `a-${Date.now()}`;

      addMessage({ id: aiId, role: 'ai', content: '', timestamp: new Date() });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                aiContent += delta;
                updateMessage(aiId, { content: aiContent });
              }
            } catch {
              // Ignore malformed JSON
            }
          }
        }
      }

      updateMessage(aiId, { content: aiContent });
      await saveToSupabase(text.trim(), aiContent);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Request timed out after 90s. Please try again.');
      } else {
        setError(err.message || 'Failed to get response');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const firstNewIndex = messages.findIndex((m) => !m.fromHistory && m.id !== 'welcome');

  return (
    <div
      className="rounded-xl border dark:border-[#334155]/70 light:border-[#e2e8f0] overflow-hidden transition-all duration-200 ease-in-out dark:bg-[#1e293b] light:bg-[#f8fafc]"
      style={{ maxHeight: isExpanded ? 320 : 44 }}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 h-[44px] dark:bg-[#1e293b] light:bg-[#f8fafc]"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-[#00d4aa]" />
          <h3 className="text-base font-bold text-[#00d4aa] tracking-wider">AI ADVISOR</h3>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] dark:text-text-tertiary-dark light:text-text-tertiary-light">
          {isExpanded ? 'Close' : 'Open'}
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="flex flex-col" style={{ height: 320 - 44 }}>
          {/* Top gradient bar */}
          <div className="h-[3px] w-full bg-gradient-to-r from-[#00d4aa] to-[#7c6aff] flex-shrink-0" />

          {/* Messages */}
          <div ref={scrollRef} className="overflow-y-auto flex-1 min-h-0 py-2 px-3 space-y-2">
            {messages.filter((m) => m.id !== 'welcome').length === 0 && !isLoading && (
              <p className="text-xs dark:text-text-tertiary-dark light:text-text-tertiary-light text-center py-4">
                Your portfolio is loaded. Ask me anything about your positions, strategies, or market conditions.
              </p>
            )}
            {messages.filter((m) => m.id !== 'welcome').map((msg, idx) => {
              const globalIdx = messages.findIndex((m) => m.id === msg.id);
              return (
                <div key={msg.id}>
                  {globalIdx === firstNewIndex && firstNewIndex > 0 && (
                    <div className="flex items-center gap-3 my-2">
                      <div className="flex-1 h-px dark:bg-border-light-dark light:bg-border-light-light" />
                      <span className="text-[9px] dark:text-text-tertiary-dark light:text-text-tertiary-light whitespace-nowrap">— Previous session —</span>
                      <div className="flex-1 h-px dark:bg-border-light-dark light:bg-border-light-light" />
                    </div>
                  )}
                  <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] px-2.5 py-1.5 rounded-2xl text-xs leading-relaxed ${
                        msg.role === 'user'
                          ? 'border dark:border-[#334155]/70 light:border-[#e2e8f0] dark:bg-bg-hover-dark light:bg-bg-hover-light dark:text-text-primary-dark light:text-text-primary-light rounded-br-md'
                          : 'border dark:border-[#334155]/70 light:border-[#e2e8f0] dark:bg-[#0d9488]/10 light:bg-[#0d9488]/5 dark:text-text-primary-dark light:text-text-primary-light rounded-bl-md prose dark:prose-invert prose-sm max-w-none'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        msg.content
                      ) : (
                        <ReactMarkdown
                          components={{
                            h1: ({ children }) => <h1 className="text-base font-semibold text-[#00d4aa] mb-0.5">{children}</h1>,
                            h2: ({ children }) => <h2 className="text-base font-semibold text-[#00d4aa] mt-1.5 mb-0.5">{children}</h2>,
                            h3: ({ children }) => <h3 className="text-base font-semibold text-[#00d4aa] mt-1.5 mb-0.5">{children}</h3>,
                            p: ({ children }) => <p className="text-xs !text-[#2563eb] dark:!text-[#60a5fa] leading-relaxed mb-0.5">{children}</p>,
                            ul: ({ children }) => <ul className="text-xs !text-[#2563eb] dark:!text-[#60a5fa] leading-relaxed pl-3 mb-0.5">{children}</ul>,
                            li: ({ children }) => <li className="!text-[#2563eb] dark:!text-[#60a5fa] mb-0">{children}</li>,
                            strong: ({ children }) => <strong className="!text-[#000000] dark:!text-white font-bold">{children}</strong>,
                            em: ({ children }) => <em className="!text-[#374151] dark:!text-[#a0b4c8]">{children}</em>,
                            hr: () => <hr className="border-t border-[#e5e7eb] dark:border-[#1a2a45] my-1" />,
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex justify-start">
                <div className="border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-2xl rounded-bl-md px-2.5 py-1.5">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 dark:bg-text-tertiary-dark light:bg-text-tertiary-light rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 dark:bg-text-tertiary-dark light:bg-text-tertiary-light rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 dark:bg-text-tertiary-dark light:bg-text-tertiary-light rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-1.5 text-[10px] text-red-400 text-center">
                {error}
              </div>
            )}
          </div>

          {/* Quick Action Chips */}
          <div className="px-3 py-1 border-t dark:border-[#334155]/70 light:border-[#e2e8f0] flex-shrink-0">
            <div className="flex gap-1.5 overflow-x-auto">
              {[
                'Latest brief',
                'Summarize my portfolio',
                "What's my biggest risk?",
                'Review my strategies',
              ].map((chip) => (
                <button
                  key={chip}
                  onClick={() => handleChipClick(chip)}
                  disabled={isLoading}
                  className="flex-shrink-0 px-2 py-0.5 text-[10px] font-bold dark:bg-bg-input-dark light:bg-bg-input-light border border-[#1e3a5f] dark:border-[#00d4aa]/40 rounded-full text-[#1e3a5f] dark:text-[#00d4aa] hover:text-[#1e3a5f] dark:hover:text-[#00d4aa] hover:border-[#1e3a5f] dark:hover:border-[#00d4aa] transition whitespace-nowrap"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="px-3 py-1.5 border-t dark:border-[#334155]/70 light:border-[#e2e8f0] flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask your advisor..."
                disabled={isLoading}
                className="flex-1 px-2.5 py-1.5 text-[11px] dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-lg dark:text-text-primary-dark light:text-text-primary-light dark:placeholder-text-placeholder-dark light:placeholder-text-placeholder-light focus:outline-none focus:ring-2 dark:focus:ring-accent-primary-dark light:focus:ring-accent-primary-light"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="p-1.5 rounded-lg bg-[var(--accent)] text-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--accent)]/90 transition"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>

          {/* Footer */}
          <div className="flex items-center justify-between px-3 py-1 border-t dark:border-[#334155]/70 light:border-[#e2e8f0] flex-shrink-0">
            <span className="text-[9px] dark:text-text-tertiary-dark light:text-text-tertiary-light">
              {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
            {isLoading && <Loader2 className="w-3 h-3 text-[var(--accent)] animate-spin" />}
          </div>
        </div>
      )}
    </div>
  );
}
