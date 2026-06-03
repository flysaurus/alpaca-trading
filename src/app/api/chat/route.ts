import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  checkUsageLimit,
  incrementUsage,
  isFinanceQuery,
  NON_FINANCE_RESPONSE,
} from '@/lib/ai-guard'
import { detectTheme, getThemeBasket, THEME_UNIVERSE } from '@/lib/stock-universe'
import { callAnalystAI, callChatAI } from '@/lib/ai-provider'
import { buildSystemPrompt, AdvisorMode, ResponseMode } from '@/lib/ai-system-prompt'

// Server-side Supabase client using service role for admin access
function getServerSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Simple session lookup — reads userId from Authorization header or session cookie
async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
  // Try Authorization: Bearer <token>
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const supabase = getServerSupabase()
    const { data } = await supabase.auth.getUser(token)
    if (data?.user?.id) return data.user.id
  }

  // Try session cookie
  const sessionToken = req.cookies.get('session')?.value
  if (sessionToken) {
    const supabase = getServerSupabase()
    const { data } = await supabase.auth.getUser(sessionToken)
    if (data?.user?.id) return data.user.id
  }

  // Fallback: userId in request body or header (for development)
  const userId = req.headers.get('x-user-id')
  if (userId) return userId

  return null
}

// Helper to build AI context — lightweight version for chat
// (full buildAIContext can be added later or imported if available)
async function buildChatContext(userId: string) {
  const supabase = getServerSupabase()

  const { data: portfolio } = await supabase.rpc('get_portfolio_with_baskets', {
    p_user_id: userId,
  })

  const { data: user } = await supabase
    .from('users')
    .select('investor_style, risk_tolerance, display_name')
    .eq('id', userId)
    .single()

  // Build portfolio summary string
  let portfolioSummary = ''
  if (portfolio) {
    const holdings = Array.isArray(portfolio) ? portfolio : [portfolio]
    portfolioSummary = holdings
      .map(
        (h: any) =>
          `${h.symbol}: ${h.qty || h.quantity || 0} shares @ $${(
            h.current_price || h.avg_entry_price || 0
          ).toFixed(2)}`
      )
      .join('\n')
  }

  return {
    portfolio: {
      totalValue: portfolio?.total_value || 0,
      buyingPower: portfolio?.buying_power || 0,
    },
    portfolioSummary,
    investorStyle: user?.investor_style || 'lynch',
    riskTolerance: user?.risk_tolerance || 'moderate',
    isDemo: !process.env.ALPACA_LIVE_TRADING,
  }
}

// Helper to save messages to chat_history — never throws
async function saveMessages(
  userId: string,
  userMessage: string,
  aiResponse: string,
  mode: string,
  model: string
) {
  try {
    const supabase = getServerSupabase()
    const now = new Date().toISOString()

    await supabase.from('chat_history').insert([
      {
        user_id: userId,
        role: 'user',
        content: userMessage,
        mode: mode,
        created_at: now,
      },
      {
        user_id: userId,
        role: 'assistant',
        content: aiResponse,
        mode: mode,
        model: model,
        created_at: now,
      },
    ])
  } catch (err) {
    // Never let save failure break the response
    console.error('Chat history save error:', err)
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Auth
    const userId = await getUserIdFromRequest(req)
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // 2. Parse body
    const body = await req.json()
    const { message, mode = 'general', responseMode = 'summary' } = body

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // 3. Finance-only guard
    if (!isFinanceQuery(message)) {
      return NextResponse.json({ content: NON_FINANCE_RESPONSE, type: 'text' })
    }

    // 4. Determine if deep analysis
    const DEEP_ANALYSIS_MODES = ['research', 'theme', 'health', 'opportunities', 'tax']
    const isDeepAnalysis =
      DEEP_ANALYSIS_MODES.includes(mode) || detectTheme(message) !== null

    // 5. Check usage limits
    const limitType = isDeepAnalysis ? 'deepAnalysis' : 'message'
    const { allowed, remaining, resetsIn } = await checkUsageLimit(userId, limitType)

    if (!allowed) {
      const limitName = isDeepAnalysis ? 'deep analysis' : 'message'
      return NextResponse.json({
        content: [
          `Daily ${limitName} limit reached (${isDeepAnalysis ? 5 : 20}/day).`,
          `Resets in ${resetsIn}.`,
          '',
          isDeepAnalysis
            ? 'You can still ask general market questions.'
            : 'Upgrade for unlimited access.',
        ].join('\n'),
        type: 'limit_reached',
        resetsIn,
      })
    }

    // 6. Get user profile
    const supabase = getServerSupabase()
    const { data: user } = await supabase
      .from('users')
      .select('investor_style, risk_tolerance, display_name')
      .eq('id', userId)
      .single()

    const investorStyle = user?.investor_style || 'lynch'
    const riskTolerance = user?.risk_tolerance || 'moderate'

    // 7. Build AI context
    const context = await buildChatContext(userId)

    // 8. Theme detection & basket generation
    const detectedTheme = detectTheme(message)

    if (detectedTheme || mode === 'theme') {
      const themeKey = detectedTheme || 'ai_infrastructure'
      const themeInfo = THEME_UNIVERSE[themeKey]

      if (!themeInfo) {
        return NextResponse.json({
          content:
            'Theme not found. Try asking about AI, clean energy, cybersecurity, healthcare, dividends, reshoring, fintech, or consumer trends.',
          type: 'text',
        })
      }

      const basketResult = await getThemeBasket(themeKey, investorStyle, riskTolerance, 2)

      const basketContext = basketResult.scoredStocks
        .map(
          (s) =>
            `${s.symbol} (${s.subTheme}):\n` +
            `Score: ${s.compositeScore}/100\n` +
            `Conviction: ${s.conviction}\n` +
            `PE: ${s.data.pe?.toFixed(1) || 'N/A'}\n` +
            `EPS Growth: ${s.data.epsGrowth?.toFixed(1) || 'N/A'}%\n` +
            `RSI: ${s.data.rsi14?.toFixed(0) || 'N/A'}\n` +
            `Trend: ${s.data.trend}\n` +
            `Sentiment: ${s.data.newsSentiment}\n` +
            `Analyst: ${s.data.analystConsensus || 'N/A'}\n` +
            `Price: $${s.data.currentPrice?.toFixed(2) || 'N/A'}\n` +
            `Target: $${s.data.targetMean?.toFixed(2) || 'N/A'}`
        )
        .join('\n\n')

      const systemPrompt = buildSystemPrompt(context, 'theme' as AdvisorMode, responseMode as ResponseMode)

      const themePrompt = [
        `Theme: ${themeInfo.emoji} ${themeInfo.name}`,
        `Description: ${themeInfo.description}`,
        `User investor style: ${investorStyle}`,
        `User risk tolerance: ${riskTolerance}`,
        '',
        'Pre-scored stocks (DO NOT change these scores):',
        basketContext,
        '',
        `User asked: "${message}"`,
        '',
        'Present this basket following the THEMATIC BASKET MODE output format exactly.',
        'Explain the investment thesis.',
        `Explain why each stock fits ${investorStyle} style.`,
        'Identify top 2 picks for this style.',
      ].join('\n')

      const aiResponse = await callAnalystAI({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: themePrompt },
        ],
      })

      // Save basket to database
      const { data: newBasket } = await supabase
        .from('baskets')
        .insert({
          user_id: userId,
          name: `${themeInfo.emoji} ${themeInfo.name}`,
          emoji: themeInfo.emoji,
          description: themeInfo.description,
          theme: themeKey,
          source: 'ai_generated',
          status: 'draft',
        })
        .select()
        .single()

      if (newBasket?.id) {
        await supabase.from('basket_positions').insert(
          basketResult.scoredStocks.map((s) => ({
            basket_id: newBasket.id,
            user_id: userId,
            symbol: s.symbol,
            company: s.company,
            sector: s.sector,
            sub_theme: s.subTheme,
            composite_score: s.compositeScore,
            conviction: s.conviction,
            reasoning: `${themeInfo.name} basket — ${s.subTheme}`,
            status: 'pending',
            is_watchlist_only: false,
            target_pct: parseFloat((100 / basketResult.scoredStocks.length).toFixed(1)),
          }))
        )

        await supabase.from('ai_suggestions').insert(
          basketResult.scoredStocks.map((s) => ({
            user_id: userId,
            symbol: s.symbol,
            company: s.company,
            sector: s.sector,
            action: 'buy',
            suggested_price: s.data.currentPrice,
            investor_style: investorStyle,
            risk_tolerance: riskTolerance,
            composite_score: s.compositeScore,
            fundamental_score: s.fundamentalScore,
            technical_score: s.technicalScore,
            sentiment_score: s.sentimentScore,
            analyst_score: s.analystScore,
            style_fit_score: s.styleFitScore,
            conviction: s.conviction,
            entry_observation_low: s.entryObservationLow,
            entry_observation_high: s.entryObservationHigh,
            reasoning: `${themeInfo.emoji} ${themeInfo.name} basket`,
          }))
        )
      }

      await incrementUsage(userId, 'deepAnalysis', aiResponse.tokensUsed, (aiResponse.tokensUsed || 0) * 0.000003)

      // Save to chat history (non-blocking)
      saveMessages(
        userId,
        message,
        aiResponse.content,
        mode,
        aiResponse.model || 'claude-sonnet'
      ).catch(() => {})

      return NextResponse.json({
        content: aiResponse.content,
        type: 'theme_basket',
        basketId: newBasket?.id || null,
        basketName: newBasket?.name || themeInfo.name,
        stockCount: basketResult.scoredStocks.length,
        stocks: basketResult.scoredStocks.map((s) => ({
          symbol: s.symbol,
          company: s.company,
          subTheme: s.subTheme,
          compositeScore: s.compositeScore,
          conviction: s.conviction,
          currentPrice: s.data.currentPrice,
        })),
        remaining: remaining - 1,
      })
    }

    // 9. Standard modes (non-theme)
    const systemPrompt = buildSystemPrompt(context, mode as AdvisorMode, responseMode as ResponseMode)

    const useDeepAnalysis = DEEP_ANALYSIS_MODES.includes(mode)
    const aiCall = useDeepAnalysis ? callAnalystAI : callChatAI

    const aiResponse = await aiCall({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
    })

    const costPerToken = useDeepAnalysis ? 0.000003 : 0.00000025

    await incrementUsage(
      userId,
      useDeepAnalysis ? 'deepAnalysis' : 'message',
      aiResponse.tokensUsed,
      (aiResponse.tokensUsed || 0) * costPerToken
    )

    // Save to chat history (non-blocking)
    saveMessages(
      userId,
      message,
      aiResponse.content,
      mode,
      aiResponse.model || 'claude-haiku'
    ).catch(() => {})

    return NextResponse.json({
      content: aiResponse.content,
      type: 'text',
      model: aiResponse.model,
      remaining: remaining - 1,
    })
  } catch (err: any) {
    console.error('Chat API error:', err.message, err.stack)
    return NextResponse.json(
      { content: 'Analysis temporarily unavailable. Please try again in a moment.', type: 'error' },
      { status: 500 }
    )
  }
}
