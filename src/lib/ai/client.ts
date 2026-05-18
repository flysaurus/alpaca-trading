/**
 * Simple LLM client for non-streaming calls.
 * Tries OpenAI first, falls back to OpenRouter.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export async function callLLM(prompt: string): Promise<string> {
  const openAIKey = process.env.OPENAI_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;

  const providers: Array<{ url: string; model: string; apiKey: string; isOpenRouter: boolean }> = [];

  if (openAIKey) {
    providers.push({ url: OPENAI_URL, model: 'gpt-4o-mini', apiKey: openAIKey, isOpenRouter: false });
  }

  if (openRouterKey) {
    providers.push({ url: OPENROUTER_URL, model: 'google/gemini-2.0-flash-001', apiKey: openRouterKey, isOpenRouter: true });
  }

  if (providers.length === 0) {
    throw new Error('No AI provider configured. Set OPENAI_API_KEY or OPENROUTER_API_KEY.');
  }

  let lastError = '';

  for (const provider of providers) {
    try {
      const body: Record<string, unknown> = {
        model: provider.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 500,
      };

      if (provider.isOpenRouter) {
        body.headers = {
          'HTTP-Referer': 'https://alpaca-dashboard.vercel.app',
          'X-Title': 'Alpaca Dashboard',
        };
      }

      const res = await fetch(provider.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        lastError = `${provider.model}: HTTP ${res.status} ${text}`;
        continue;
      }

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        lastError = `${provider.model}: No content in response`;
        continue;
      }

      return content.trim();
    } catch (err: any) {
      lastError = `${provider.model}: ${err.message}`;
    }
  }

  throw new Error(`All LLM providers failed. Last error: ${lastError}`);
}
