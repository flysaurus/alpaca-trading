import { NextResponse } from 'next/server';
import { getAccount, getPositions, getBars } from '@/lib/alpaca';
import { calculateRiskScore, type RiskScore } from '@/lib/riskScore';
import { checkRateLimit, getClientIP, rateLimitHeaders } from '@/lib/ratelimit';
import { requireSession } from '@/lib/session';

// RSI calculation (inline to avoid extra import)
function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// Fetch VIXY as VIX proxy
async function fetchVix(): Promise<number | null> {
  try {
    const bars = await getBars({ symbol: 'VIXY', timeframe: '1D', limit: 2 });
    if (bars.length === 0) return null;
    return Number(Number(bars[bars.length - 1].close || bars[bars.length - 1].c).toFixed(2));
  } catch {
    return null;
  }
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

  const keys = await requireSession();
  if (!keys) {
    return NextResponse.json({ error: 'Session expired, re-authenticate' }, { status: 401 });
  }

  try {
    const [account, positions] = await Promise.all([
      getAccount(),
      getPositions(),
    ]);

    const equity = Number(account.equity || 0);
    const cash = Number(account.cash || 0);

    // Enrich positions with RSI
    const enrichedPositions: any[] = await Promise.all(
      positions.map(async (p: any) => {
        const pos: any = {
          symbol: p.symbol,
          qty: Number(p.qty || 0),
          market_value: Number(p.market_value || 0),
          current_price: Number(p.current_price || 0),
          unrealized_plpc: Number(p.unrealized_plpc || 0),
        };

        try {
          const bars = await getBars({ symbol: p.symbol, timeframe: '1D', limit: 25 });
          const closes = bars.map((b: any) => Number(b.close || b.c || 0)).filter((c: number) => c > 0);
          if (closes.length >= 15) {
            pos.rsi = Number(calculateRSI(closes, 14).toFixed(1));
          }
        } catch {
          // RSI fetch failed, skip
        }

        return pos;
      })
    );

    const vix = await fetchVix();

    const riskScore: RiskScore = calculateRiskScore(
      enrichedPositions,
      { equity, cash },
      vix
    );

    return NextResponse.json(
      { risk_score: riskScore },
      { headers: rateLimitHeaders(limit) }
    );
  } catch (error: any) {
    console.error('[API /risk-score] Error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Failed to calculate risk score' },
      { status: 500, headers: rateLimitHeaders(limit) }
    );
  }
}
