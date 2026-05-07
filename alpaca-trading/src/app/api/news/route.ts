import { NextResponse } from 'next/server';
import { aggregateNews, extractSymbolsFromText, ScoredNews } from '@/lib/news';
import { checkRateLimit, getClientIP, rateLimitHeaders } from '@/lib/ratelimit';

// OpenRouter AI sentiment enrichment
// Supports: FinBERT, GPT-5-mini, Llama-3.3-70B, and more
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Model config - change as desired
// OpenRouter supports: google/gemini-2.0-flash-exp, meta-llama/llama-3.3-70b-instruct, openbmb/finbert-sentiment, etc.
const SENTIMENT_MODEL = process.env.SENTIMENT_MODEL || 'openbmb/finbert-sentiment'; // Default to FinBERT for financial sentiment
const LLM_MODEL = process.env.LLM_MODEL || 'openai/gpt-5-mini'; // For general LLM tasks

async function enhanceWithOpenRouter(news: ScoredNews[]): Promise<ScoredNews[]> {
  if (!OPENROUTER_API_KEY) {
    console.log('[OpenRouter] No API key, using keyword-based scoring');
    return news;
  }

  console.log(`[OpenRouter] Enhancing ${news.length} news items with AI`);

  const enhanced: ScoredNews[] = [];

  for (const item of news) {
    try {
      console.log(`[OpenRouter] Processing: ${item.headline.substring(0, 50)}...`);
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.href : '',
          'X-Title': 'Alpaca Trading',
        },
        body: JSON.stringify({
          model: SENTIMENT_MODEL,
          messages: [
            {
              role: 'system',
              content: `You are a financial news sentiment analyst. Analyze the news headline and summary for stock market sentiment.

Return a JSON object with:
- sentiment: "bullish" or "bearish" or "neutral"
- score: number from -1 (bearish) to +1 (bullish)
- trading_implications: brief 1-2 sentence summary of trading implications
- key_takeaways: array of 2-3 key points

Return ONLY valid JSON, no additional text.`,
            },
            {
              role: 'user',
              content: `Analyze this financial news for trading implications:\n\nHeadline: ${item.headline}\nSummary: ${item.summary}\n\nReturn ONLY valid JSON.`,
            },
          ],
          temperature: 0.3,
          max_tokens: 512,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content || '{}';
        
        // Extract JSON from response (might have markdown backticks)
        let parsed: any = {};
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
        } catch {
          // Keep original scores if parsing fails
        }

        enhanced.push({
          ...item,
          sentiment: parsed.sentiment || item.sentiment,
          sentimentScore: parsed.score !== undefined ? parsed.score : item.sentimentScore,
          openRouterAnalysis: {
            model: SENTIMENT_MODEL,
            tradingImplications: parsed.trading_implications || '',
            keyTakeaways: parsed.key_takeaways || [],
            confidence: data?.usage?.total_tokens ? 0.8 : 0.5,
          },
        });
      } else {
        enhanced.push({ ...item, openRouterAnalysis: { model: SENTIMENT_MODEL, tradingImplications: '', keyTakeaways: [], confidence: 0.3 } });
      }
    } catch (err) {
      console.warn('[OpenRouter] Error for', item.id, err);
      enhanced.push({ ...item, openRouterAnalysis: { model: SENTIMENT_MODEL, tradingImplications: '', keyTakeaways: [], confidence: 0.1 } });
    }
  }

  return enhanced;
}

export async function GET(request: Request) {
  const ip = getClientIP(request);
  const limit = checkRateLimit(ip);

  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  try {
    const url = new URL(request.url);
    const symbolsParam = url.searchParams.get('symbols');
    const symbols = symbolsParam ? symbolsParam.split(',').map(s => s.trim().toUpperCase()) : undefined;
    const count = parseInt(url.searchParams.get('limit') || '50', 10);

    let news = await aggregateNews(symbols, count);
    
    // Enhance with AI if available (OpenRouter)
    news = await enhanceWithOpenRouter(news);

    return NextResponse.json(
      {
        news,
        count: news.length,
        timestamp: new Date().toISOString(),
      },
      { headers: rateLimitHeaders(limit) }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch news' },
      { status: 500, headers: rateLimitHeaders(limit) }
    );
  }
}
