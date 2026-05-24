// ── Smart AI Client with Provider Routing ──────────────────────
// Routes prompts to Claude (conversational/nuanced) or
// DeepSeek (structured/scoring) based on prompt type.
//
// Claude: Chat, market context, educational explanations
// DeepSeek: Recommendations, risk analysis, intent classification

import { PROMPT_ROUTING } from './prompts';

// ── Provider Endpoints ─────────────────────────────────────────
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

// ── Types ──────────────────────────────────────────────────────
export type Provider = 'claude' | 'deepseek' | 'openai' | 'openrouter';
export type PromptType = keyof typeof PROMPT_ROUTING;

export interface LLMOptions {
  temperature?: number;
  max_tokens?: number;
  systemPrompt?: string;
  promptType?: PromptType;
}

export interface LLMResponse {
  content: string;
  provider: string;
  model: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

// ── Key Management ─────────────────────────────────────────────
function cleanKey(key: string): string {
  return key.replace(/^API\s*Key\s*/i, '').trim();
}

function getAnthropicKey(): string | null {
  const key = cleanKey(process.env.CLAUDE_API_KEY || process.env['CLAUDE_API-KEY'] || process.env.ANTHROPIC_API_KEY || '');
  return key || null;
}

function getDeepSeekKey(): string | null {
  return cleanKey(process.env.DEEPSEEK_API_KEY || '') || null;
}

function getOpenAIKey(): string | null {
  return cleanKey(process.env.OPENAI_API_KEY || '') || null;
}

function getOpenRouterKey(): string | null {
  return cleanKey(process.env.OPENROUTER_API_KEY || '') || null;
}

// ── Provider Resolution ────────────────────────────────────────
/**
 * Determine which provider to use based on prompt type.
 * Overrideable via explicit `provider` in options.
 */
export function resolveProvider(promptType?: PromptType): Provider {
  if (promptType && PROMPT_ROUTING[promptType]) {
    return PROMPT_ROUTING[promptType];
  }
  // Default: try Claude for conversation, DeepSeek for everything else
  return 'deepseek';
}

/**
 * Build the provider chain in priority order for the given prompt type.
 */
function buildProviderChain(promptType?: PromptType): Array<{
  provider: Provider;
  model: string;
  apiKey: string | null;
  url: string;
}> {
  const chain: Array<{
    provider: Provider;
    model: string;
    apiKey: string | null;
    url: string;
  }> = [];

  const target = resolveProvider(promptType);

  if (target === 'claude') {
    // Primary: Claude via Anthropic API
    const anthropicKey = getAnthropicKey();
    if (anthropicKey) {
      chain.push({
        provider: 'claude',
        model: 'claude-sonnet-4-20250514',
        apiKey: anthropicKey,
        url: ANTHROPIC_URL,
      });
    }
    // Fallback: Claude via OpenRouter
    const openRouterKey = getOpenRouterKey();
    if (openRouterKey) {
      chain.push({
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-4-20250514',
        apiKey: openRouterKey,
        url: OPENROUTER_URL,
      });
    }
    // Last fallback: DeepSeek via OpenRouter
    if (openRouterKey) {
      chain.push({
        provider: 'openrouter',
        model: 'deepseek/deepseek-chat',
        apiKey: openRouterKey,
        url: OPENROUTER_URL,
      });
    }
  } else {
    // DeepSeek target: direct API first, OpenRouter fallback
    const deepseekKey = getDeepSeekKey();
    if (deepseekKey) {
      chain.push({
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKey: deepseekKey,
        url: 'https://api.deepseek.com/v1/chat/completions',
      });
    }
    const openRouterKey = getOpenRouterKey();
    if (openRouterKey) {
      chain.push({
        provider: 'openrouter',
        model: 'deepseek/deepseek-chat',
        apiKey: openRouterKey,
        url: OPENROUTER_URL,
      });
    }
    // Fallback to OpenAI
    const openaiKey = getOpenAIKey();
    if (openaiKey) {
      chain.push({
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: openaiKey,
        url: OPENAI_URL,
      });
    }
  }

  return chain;
}

// ── Claude API Call (Anthropic format) ─────────────────────────
async function callClaude(
  systemPrompt: string | undefined,
  userMessage: string,
  apiKey: string,
  opts?: LLMOptions
): Promise<LLMResponse> {
  const messages: Array<{ role: 'user'; content: string }> = [
    { role: 'user', content: userMessage },
  ];

  const body: Record<string, unknown> = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: opts?.max_tokens ?? 1024,
    temperature: opts?.temperature ?? 0.3,
    messages,
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const content = json.content?.[0]?.text || '';

  return {
    content: content.trim(),
    provider: 'claude',
    model: 'claude-sonnet-4-20250514',
    usage: {
      input_tokens: json.usage?.input_tokens || 0,
      output_tokens: json.usage?.output_tokens || 0,
    },
  };
}

// ── OpenAI-compatible API Call (OpenRouter, DeepSeek, OpenAI) ──
async function callOpenAICompatible(
  systemPrompt: string | undefined,
  userMessage: string,
  url: string,
  model: string,
  apiKey: string,
  provider: string,
  isOpenRouter: boolean,
  opts?: LLMOptions
): Promise<LLMResponse> {
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userMessage });

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts?.temperature ?? 0.1,
    max_tokens: opts?.max_tokens ?? 1024,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  if (isOpenRouter) {
    headers['HTTP-Referer'] = 'https://alpaca-dashboard.vercel.app';
    headers['X-Title'] = 'Alpaca Trader OS';
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${model} API error ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content || '';

  return {
    content: content.trim(),
    provider,
    model,
    usage: {
      input_tokens: json.usage?.prompt_tokens || 0,
      output_tokens: json.usage?.completion_tokens || 0,
    },
  };
}

// ── Main Entry Point ───────────────────────────────────────────
/**
 * Call the appropriate LLM based on prompt type routing.
 *
 * @param userMessage - The user's message or prompt content
 * @param opts.systemPrompt - System prompt to use (required)
 * @param opts.promptType - Type of prompt (routes to Claude or DeepSeek)
 * @param opts.temperature - Model temperature
 * @param opts.max_tokens - Max output tokens
 *
 * @example
 * // Routes to Claude for conversation
 * const reply = await callLLM("Should I buy NVDA?", {
 *   systemPrompt: CHAT_ASSISTANT_SYSTEM,
 *   promptType: 'CHAT_ASSISTANT',
 * });
 *
 * @example
 * // Routes to DeepSeek for structured analysis
 * const risk = await callLLM(portfolioData, {
 *   systemPrompt: RISK_ANALYSIS_SYSTEM,
 *   promptType: 'RISK_ANALYSIS',
 *   temperature: 0.0,
 * });
 */
export async function callLLM(
  userMessage: string,
  opts: LLMOptions = {}
): Promise<LLMResponse> {
  const chain = buildProviderChain(opts.promptType);

  if (chain.length === 0) {
    throw new Error(
      'No AI provider configured. Set CLAUDE_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY.'
    );
  }

  let lastError = '';
  const errors: string[] = [];

  for (const entry of chain) {
    if (!entry.apiKey) {
      errors.push(`${entry.provider}/${entry.model}: No API key configured`);
      continue;
    }

    try {
      console.log(`[AI Client] Trying ${entry.provider} / ${entry.model}...`);

      let result: LLMResponse;

      if (entry.provider === 'claude' && entry.url === ANTHROPIC_URL) {
        result = await callClaude(
          opts.systemPrompt,
          userMessage,
          entry.apiKey,
          opts
        );
      } else {
        result = await callOpenAICompatible(
          opts.systemPrompt,
          userMessage,
          entry.url,
          entry.model,
          entry.apiKey,
          entry.provider,
          entry.url === OPENROUTER_URL,
          opts
        );
      }

      console.log(
        `[AI Client] ✓ ${result.provider} / ${result.model} responded (${result.content.length} chars)`
      );
      return result;
    } catch (err: any) {
      const msg = `${entry.provider}/${entry.model}: ${err.message}`;
      console.warn(`[AI Client] ✗ ${msg}`);
      errors.push(msg);
      lastError = msg;
    }
  }

  throw new Error(
    `All LLM providers failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`
  );
}

// ── Streaming Call (for chat UI) ───────────────────────────────
/**
 * Stream a response from the appropriate LLM.
 * Returns a ReadableStream of SSE data chunks.
 */
export async function callLLMStream(
  userMessage: string,
  opts: LLMOptions & { conversationHistory?: Array<{ role: string; content: string }> }
): Promise<Response> {
  const chain = buildProviderChain(opts.promptType);

  if (chain.length === 0) {
    throw new Error('No AI provider configured.');
  }

  const entry = chain[0]; // Use first available provider
  if (!entry.apiKey) {
    throw new Error(`No API key for ${entry.provider}/${entry.model}`);
  }

  const messages: Array<{ role: string; content: string }> = [];

  if (opts.systemPrompt) {
    messages.push({ role: 'system', content: opts.systemPrompt });
  }

  if (opts.conversationHistory) {
    for (const m of opts.conversationHistory) {
      if (m.content?.trim()) {
        messages.push({
          role: m.role === 'ai' ? 'assistant' : m.role,
          content: m.content,
        });
      }
    }
  }

  messages.push({ role: 'user', content: userMessage });

  if (entry.provider === 'claude' && entry.url === ANTHROPIC_URL) {
    // Anthropic streaming
    const body = {
      model: entry.model,
      max_tokens: opts.max_tokens ?? 1024,
      temperature: opts.temperature ?? 0.3,
      system: opts.systemPrompt,
      messages: messages.map((m) => ({
        role: 'user',
        content: m.content,
      })),
      stream: true,
    };

    const res = await fetch(entry.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': entry.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Claude stream error ${res.status}: ${text.slice(0, 300)}`);
    }

    return res;
  }

  // OpenAI-compatible streaming
  const body: Record<string, unknown> = {
    model: entry.model,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.max_tokens ?? 1024,
    stream: true,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${entry.apiKey}`,
  };

  if (entry.url === OPENROUTER_URL) {
    headers['HTTP-Referer'] = 'https://alpaca-dashboard.vercel.app';
    headers['X-Title'] = 'Alpaca Trader OS';
  }

  return fetch(entry.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

// ── Convenience: Call Claude for conversation ──────────────────
export async function callClaudeConversation(
  userMessage: string,
  systemPrompt: string,
  opts?: { temperature?: number; max_tokens?: number }
): Promise<LLMResponse> {
  return callLLM(userMessage, {
    ...opts,
    systemPrompt,
    promptType: 'CHAT_ASSISTANT',
  });
}

// ── Convenience: Call DeepSeek for structured analysis ─────────
export async function callDeepSeekStructured(
  userMessage: string,
  systemPrompt: string,
  opts?: { temperature?: number; max_tokens?: number }
): Promise<LLMResponse> {
  return callLLM(userMessage, {
    ...opts,
    systemPrompt,
    promptType: 'RECOMMENDATION_ENGINE',
    temperature: opts?.temperature ?? 0.0,
  });
}
