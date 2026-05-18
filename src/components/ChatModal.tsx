'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Brain, Send, Loader2, X } from 'lucide-react';
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

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  alpacaAccountId: string | null;
}

export default function ChatModal({ isOpen, onClose, alpacaAccountId }: ChatModalProps) {
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
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const userId = getUserId();

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Pre-fill input from Zustand store when modal opens
  useEffect(() => {
    const { pendingMessage } = useChatStore.getState();
    if (isOpen && pendingMessage) {
      setInput(pendingMessage);
      useChatStore.getState().clearPendingMessage();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

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

  // Load cross-session history on first mount
  useEffect(() => {
    if (historyLoaded || !isOpen) return;

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
  }, [historyLoaded, isOpen, userId, setMessages]);

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

  const handleClear = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'ai',
        content: 'Your portfolio is loaded. Ask me anything about your positions, strategies, or market conditions.',
        timestamp: new Date(),
      },
    ]);
    setShowClearConfirm(false);
  };

  const firstNewIndex = messages.findIndex((m) => !m.fromHistory && m.id !== 'welcome');

  // Block scroll on body when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed z-50
          bottom-[80px] right-3 w-[90vw] max-w-[360px] h-[50vh] max-h-[420px]
          md:w-[380px] md:h-[500px] md:bottom-8 md:right-6 md:max-h-[500px]
          animate-in slide-in-from-bottom duration-300 md:slide-in-from-bottom-0 md:zoom-in-95
          rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dark:bg-bg-card-dark light:bg-bg-card-light rounded-2xl border dark:border-[#334155]/70 light:border-[#e2e8f0] overflow-hidden flex flex-col shadow-2xl h-full">
          {/* Top gradient bar */}
          <div className="h-[3px] w-full bg-gradient-to-r from-[#00d4aa] to-[#7c6aff] rounded-t-2xl flex-shrink-0" />

          {/* Header */}
          <div className="flex items-center justify-between py-2 px-3 border-b dark:border-[#334155]/70 light:border-[#e2e8f0] flex-shrink-0">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-[#00d4aa]" />
              <h3 className="text-base font-bold text-[#00d4aa] tracking-wider">AI ADVISOR</h3>
            </div>
            <div className="flex items-center gap-2">
              {isLoading && <Loader2 className="w-4 h-4 text-[var(--accent)] animate-spin" />}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:dark:bg-bg-hover-dark hover:light:bg-bg-hover-light transition"
              >
                <X className="w-5 h-5 dark:text-text-secondary-dark light:text-text-secondary-light" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="overflow-y-auto flex-1 min-h-[120px] py-2 px-3 space-y-3">
            {messages.filter((m) => m.id !== 'welcome').map((msg, idx) => (
              <div key={msg.id}>
                {idx === firstNewIndex && firstNewIndex > 0 && (
                  <div className="flex items-center gap-3 my-3">
                    <div className="flex-1 h-px dark:bg-border-light-dark light:bg-border-light-light" />
                    <span className="text-[10px] dark:text-text-tertiary-dark light:text-text-tertiary-light whitespace-nowrap">— Previous session —</span>
                    <div className="flex-1 h-px dark:bg-border-light-dark light:bg-border-light-light" />
                  </div>
                )}
                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
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
                          h1: ({ children }) => <h1 className="text-xl font-semibold text-[#00d4aa] mb-1">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-xl font-semibold text-[#00d4aa] mt-2 mb-1">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-xl font-semibold text-[#00d4aa] mt-2 mb-1">{children}</h3>,
                          p: ({ children }) => <p className="text-sm !text-[#2563eb] dark:!text-[#60a5fa] leading-relaxed mb-1">{children}</p>,
                          ul: ({ children }) => <ul className="text-sm !text-[#2563eb] dark:!text-[#60a5fa] leading-relaxed pl-4 mb-1">{children}</ul>,
                          li: ({ children }) => <li className="!text-[#2563eb] dark:!text-[#60a5fa] mb-0">{children}</li>,
                          strong: ({ children }) => <strong className="!text-[#000000] dark:!text-white font-bold">{children}</strong>,
                          em: ({ children }) => <em className="!text-[#374151] dark:!text-[#a0b4c8]">{children}</em>,
                          hr: () => <hr className="border-t border-[#e5e7eb] dark:border-[#1a2a45] my-1.5" />,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex justify-start">
                <div className="border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-2xl rounded-bl-md px-3 py-2">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 dark:bg-text-tertiary-dark light:bg-text-tertiary-light rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 dark:bg-text-tertiary-dark light:bg-text-tertiary-light rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 dark:bg-text-tertiary-dark light:bg-text-tertiary-light rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-2 text-[11px] text-red-400 text-center">
                {error}
              </div>
            )}
          </div>

          {/* Quick Action Chips */}
          <div className="px-3 py-1.5 border-t dark:border-[#334155]/70 light:border-[#e2e8f0] flex-shrink-0">
            <div className="flex gap-2 overflow-x-auto pb-1">
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
                  className="flex-shrink-0 px-2.5 py-1 text-[11px] font-bold dark:bg-bg-input-dark light:bg-bg-input-light border border-[#1e3a5f] dark:border-[#00d4aa]/40 rounded-full text-[#1e3a5f] dark:text-[#00d4aa] hover:text-[#1e3a5f] dark:hover:text-[#00d4aa] hover:border-[#1e3a5f] dark:hover:border-[#00d4aa] transition whitespace-nowrap"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="px-3 py-2 border-t dark:border-[#334155]/70 light:border-[#e2e8f0] flex-shrink-0">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask your advisor..."
                disabled={isLoading}
                className="flex-1 px-3 py-2 text-xs dark:bg-bg-input-dark light:bg-bg-input-light border dark:border-[#334155]/70 light:border-[#e2e8f0] rounded-xl dark:text-text-primary-dark light:text-text-primary-light dark:placeholder-text-placeholder-dark light:placeholder-text-placeholder-light focus:outline-none focus:ring-2 dark:focus:ring-accent-primary-dark light:focus:ring-accent-primary-light"
                autoFocus
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="p-2 rounded-xl bg-[var(--accent)] text-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--accent)]/90 transition"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t dark:border-[#334155]/70 light:border-[#e2e8f0] flex-shrink-0">
            <span className="text-[10px] dark:text-text-tertiary-dark light:text-text-tertiary-light">
              {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
            <div className="flex items-center gap-2">
              {showClearConfirm ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] dark:text-text-tertiary-dark light:text-text-tertiary-light">Clear?</span>
                  <button onClick={handleClear} className="px-2 py-0.5 text-[10px] font-bold bg-[var(--red)]/10 text-[var(--red)] rounded hover:bg-[var(--red)]/20 transition">Clear</button>
                  <button onClick={() => setShowClearConfirm(false)} className="px-2 py-0.5 text-[10px] dark:bg-bg-input-dark light:bg-bg-input-light dark:text-text-tertiary-dark light:text-text-tertiary-light rounded hover:dark:bg-bg-hover-dark hover:light:bg-bg-hover-light transition">Cancel</button>
                </div>
              ) : (
                messages.length > 1 && (
                  <button onClick={() => setShowClearConfirm(true)} className="text-[10px] dark:text-text-tertiary-dark light:text-text-tertiary-light hover:dark:text-text-primary-dark hover:light:text-text-primary-light transition px-2 py-0.5 rounded hover:dark:bg-bg-hover-dark hover:light:bg-bg-hover-light">
                    Clear history
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
