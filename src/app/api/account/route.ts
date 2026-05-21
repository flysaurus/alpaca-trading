import { NextResponse } from 'next/server';
import { getAccount, getPositions, AlpacaError, IS_PAPER } from '@/lib/alpaca';
import { checkRateLimit, getClientIP, rateLimitHeaders } from '@/lib/ratelimit';
import { calculatePortfolioRisk } from '@/lib/risk';
import { requireSession, parseSessionToken } from '@/lib/session';
import { headers } from 'next/headers';

export async function GET(request: Request) {
  const ip = getClientIP(request);
  const limit = checkRateLimit(ip);
  const diag: string[] = [];

  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Max 30 requests per minute.' },
      { status: 429, headers: rateLimitHeaders(limit) }
    );
  }

  // Trace: Auth header
  try {
    const h = await headers();
    const auth = h.get('authorization');
    diag.push(`auth_header: ${auth ? auth.substring(0, 30) + '...' : 'MISSING'}`);
    if (auth?.startsWith('Bearer ')) {
      const parsed = parseSessionToken(auth.slice(7));
      diag.push(`token_valid: ${!!parsed}, userId: ${parsed?.userId?.substring(0, 8) || '?'}`);
    }
  } catch (e: any) { diag.push(`header_error: ${e.message}`); }

  // Trace: Session
  let keys: { apiKey: string; secretKey: string } | null = null;
  try {
    keys = await requireSession();
    diag.push(`session_keys: ${keys ? 'FOUND' : 'NULL'}`);
    if (keys) diag.push(`key_prefix: ${keys.apiKey.substring(0, 6)}...`);
  } catch (e: any) { diag.push(`session_error: ${e.message}`); }

  if (!keys) {
    diag.push('RESULT: 401 - no session keys');
    return NextResponse.json({ error: 'Session expired, re-authenticate', _diag: diag }, { status: 401 });
  }

  // Trace: Alpaca
  let account: any, positions: any[];
  try {
    [account, positions] = await Promise.all([getAccount(), getPositions()]);
    diag.push(`alpaca_account: status=${account?.status}, cash=${account?.cash}, pv=${account?.portfolio_value}`);
    diag.push(`positions_count: ${positions?.length || 0}`);
  } catch (error: any) {
    diag.push(`alpaca_error: ${error.message} (status=${error.status})`);
    const s = error instanceof AlpacaError ? error.status : 500;
    return NextResponse.json(
      { error: error.message || 'Failed to fetch account', _diag: diag },
      { status: s, headers: rateLimitHeaders(limit) }
    );
  }

  // Trace: Mapping
  const portfolioValue = Number(account.portfolio_value);
  diag.push(`mapped_pv: ${portfolioValue}, cash: ${Number(account.cash)}, equity: ${Number(account.equity)}`);

  try {
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
        _diag: diag,
      },
      { headers: rateLimitHeaders(limit) }
    );
  } catch (error: any) {
    diag.push(`mapping_error: ${error.message}`);
    return NextResponse.json(
      { error: error.message || 'Mapping failed', _diag: diag },
      { status: 500 }
    );
  }
}
