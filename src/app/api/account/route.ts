import { NextResponse } from 'next/server';
import { getAccount, getPositions, AlpacaError, IS_PAPER } from '@/lib/alpaca';
import { checkRateLimit, getClientIP, rateLimitHeaders } from '@/lib/ratelimit';
import { calculatePortfolioRisk } from '@/lib/risk';
import { requireSession } from '@/lib/session';

export async function GET(request: Request) {
  const ip = getClientIP(request);
  const limit = checkRateLimit(ip);

  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Max 30 requests per minute.' },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  // Require valid session
  const keys = await requireSession();
  if (!keys) {
    return NextResponse.json({ error: 'Session expired, re-authenticate' }, { status: 401 });
  }

  try {
    const [account, positions] = await Promise.all([
      getAccount(),
      getPositions(),
    ]);

    const portfolioValue = Number(account.portfolio_value);
    const risk = calculatePortfolioRisk(positions, portfolioValue);

    return NextResponse.json(
      {
        account: {
          id: account.id,
          cash: Number(account.cash),
          portfolioValue,
          buyingPower: Number(account.buying_power),
          equity: Number(account.equity),
          lastEquity: Number(account.last_equity || account.equity),
          lastPortfolioValue: Number(account.last_portfolio_value || portfolioValue),
          dayTradeCount: Number(account.daytrade_count || 0),
          status: account.status,
          tradingMode: IS_PAPER ? 'paper' : 'live',
        },
        positions: positions.map((p: any) => ({
          symbol: p.symbol,
          qty: Number(p.qty),
          marketValue: Number(p.market_value),
          avgEntryPrice: Number(p.avg_entry_price),
          currentPrice: Number(p.current_price),
          unrealizedPL: Number(p.unrealized_pl),
          unrealizedPLPercent: Number(p.unrealized_plpc) * 100,
          changeToday: Number(p.change_today),
          side: Number(p.qty) >= 0 ? 'long' : 'short',
        })),
        risk,
      },
      { headers: rateLimitHeaders(limit) }
    );
  } catch (error: any) {
    const status = error instanceof AlpacaError ? error.status : 500;
    return NextResponse.json(
      { error: error.message || 'Failed to fetch account' },
      { status, headers: rateLimitHeaders(limit) }
    );
  }
}
