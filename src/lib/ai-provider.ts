export interface AIRequestOptions {
  messages: { role: string; content: string }[]
  maxTokens?: number
  temperature?: number
}

export interface AIResponse {
  content: string
  model: string
  tokensUsed: number
}

interface AIProvider {
  name: string
  call(options: AIRequestOptions): Promise<AIResponse>
}

class ClaudeProvider implements AIProvider {
  private model: string

  constructor(model: string = 'claude-sonnet-4-6') {
    this.model = model
  }

  name = 'claude'

  async call(options: AIRequestOptions): Promise<AIResponse> {
    const systemMessage = options.messages.find((m) => m.role === 'system')
    const userMessages = options.messages.filter((m) => m.role !== 'system')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.2,
        system: systemMessage?.content || '',
        messages: userMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(`Claude error: ${data.error?.message || 'Unknown'}`)
    }

    return {
      content: data.content[0].text,
      model: this.model,
      tokensUsed: data.usage?.input_tokens + data.usage?.output_tokens,
    }
  }
}

export function getAIProvider(): ClaudeProvider {
  return new ClaudeProvider()
}

export async function callAI(options: AIRequestOptions): Promise<AIResponse> {
  const provider = getAIProvider()
  return provider.call(options)
}

export async function callAnalystAI(
  options: AIRequestOptions
): Promise<AIResponse> {
  // Always uses Claude Sonnet for deep analysis
  const provider = new ClaudeProvider('claude-sonnet-4-6')
  return provider.call({
    ...options,
    maxTokens: options.maxTokens || 1500,
    temperature: 0.2,
  })
}

export async function callChatAI(
  options: AIRequestOptions
): Promise<AIResponse> {
  // Uses Claude Haiku for general chat
  // Cheaper and faster for simple queries
  const provider = new ClaudeProvider('claude-haiku-4-5')
  return provider.call({
    ...options,
    maxTokens: options.maxTokens || 500,
    temperature: 0.2,
  })
}
