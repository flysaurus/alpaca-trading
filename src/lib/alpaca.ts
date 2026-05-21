import Alpaca from '@alpacahq/alpaca-trade-api';

// ── Configuration ───────────────────────────────────────────────
const TRADING_MODE = process.env.TRADING_MODE || 'paper';
const IS_PAPER = TRADING_MODE !== 'live';

function getKeyId(): string {
  const key = process.env.ALPACA_API_KEY;
  if (!key) throw new AlpacaError('ALPACA_API_KEY not set', 500);
  return key;
}

function getSecretKey(): string {
  const key = process.env.ALPACA_SECRET_KEY;
  if (!key) throw new AlpacaError('ALPACA_SECRET_KEY not set', 500);
  return key;
}

// ── Typed Error ─────────────────────────────────────────────────
export class AlpacaError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = 'AlpacaError';
    this.status = status;
  }
}

// ── Client Factory ──────────────────────────────────────────────

/**
 * Create an Alpaca client with explicit credentials.
 * Used when the API route already has decrypted keys from the session.
 */
export function createAlpacaClient(
  keyId: string,
  secretKey: string,
  paper: boolean = IS_PAPER
): Alpaca {
  return new Alpaca({
    keyId,
    secretKey,
    paper,
    usePolygon: false,
  });
}

/**
 * Session-aware client factory.
 *
 * 1. First tries to read the session cookie and retrieve decrypted
 *    keys from the in-memory session map (multi-tenant).
 * 2. Falls back to env vars (ALPACA_API_KEY / ALPACA_SECRET_KEY)
 *    for backward compatibility and non-request contexts (cron, CLI).
 *
 * NOTE: Client is NOT cached — each call creates a fresh instance
 * so multi-user sessions get the correct keys.
 */
async function getClient(): Promise<Alpaca> {
  // Try session-based keys first (with cold-start recovery)
  try {
    const { getSessionKeys } = await import('./session');
    const keys = await getSessionKeys();
    if (keys) {
      return createAlpacaClient(keys.apiKey, keys.secretKey);
    }
  } catch {
    // cookies() throws outside request context (cron jobs, CLI, build)
    // Fall through to env-vars fallback
  }

  // Fall back to environment variables
  return createAlpacaClient(getKeyId(), getSecretKey());
}

// ── Account ─────────────────────────────────────────────────────
export async function getAccount() {
  try {
    const client = await getClient();
    return await client.getAccount();
  } catch (err: any) {
    throw new AlpacaError(err.message || 'Failed to fetch account', 502);
  }
}

// ── Positions ───────────────────────────────────────────────────
export async function getPositions() {
  try {
    const client = await getClient();
    return await client.getPositions();
  } catch (err: any) {
    throw new AlpacaError(err.message || 'Failed to fetch positions', 502);
  }
}

// ── Orders ──────────────────────────────────────────────────────
export async function getOrders({
  status = 'open',
  limit = 50,
  after,
  until,
}: {
  status?: 'open' | 'closed' | 'all';
  limit?: number;
  after?: string;
  until?: string;
} = {}) {
  try {
    const client = await getClient();
    return await client.getOrders({
      status,
      limit,
      after,
      until,
      direction: undefined,
      nested: undefined,
      symbols: undefined,
    } as any);
  } catch (err: any) {
    throw new AlpacaError(err.message || 'Failed to fetch orders', 502);
  }
}

export async function placeOrder(params: {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type?: 'market' | 'limit' | 'stop' | 'stop_limit';
  time_in_force?: 'day' | 'gtc' | 'ioc';
  stop_price?: number;
  limit_price?: number;
}) {
  try {
    const client = await getClient();
    if (IS_PAPER) {
      console.log(`[PAPER] Order: ${params.side.toUpperCase()} ${params.qty} ${params.symbol} @ ${params.type || 'market'}`);
    }
    return await client.createOrder({
      symbol: params.symbol,
      qty: params.qty,
      side: params.side,
      type: params.type || 'market',
      time_in_force: params.time_in_force || 'day',
      ...(params.stop_price ? { stop_price: params.stop_price } : {}),
      ...(params.limit_price ? { limit_price: params.limit_price } : {}),
    });
  } catch (err: any) {
    const status = err.statusCode || err.status || 500;
    throw new AlpacaError(err.message || 'Order placement failed', status);
  }
}

export async function cancelOrder(orderId: string) {
  try {
    const client = await getClient();
    return await client.cancelOrder(orderId);
  } catch (err: any) {
    throw new AlpacaError(err.message || 'Failed to cancel order', 502);
  }
}

// ── Market Data ─────────────────────────────────────────────────
export async function getLatestQuotes(symbols: string[]) {
  const client = await getClient();
  const quotes: Record<string, any> = {};

  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        quotes[symbol] = await client.getLatestQuote(symbol);
      } catch {
        quotes[symbol] = null;
      }
    })
  );

  return quotes;
}

export async function getBars({
  symbol,
  timeframe = '1D',
  limit = 30,
}: {
  symbol: string;
  timeframe?: string;
  limit?: number;
}) {
  try {
    const client = await getClient();
    const resp = await client.getBarsV2(
      symbol,
      { timeframe, limit },
      {} as any
    );
    const data: any[] = [];
    for await (const bar of resp) {
      data.push(bar);
    }
    return data;
  } catch (err: any) {
    console.error('[Alpaca] getBars error:', JSON.stringify({
      symbol,
      errType: typeof err,
      errKeys: Object.keys(err || {}),
      errMessage: err?.message,
      errCode: err?.code,
      errStatus: err?.status,
      errBody: err?.response?.body,
      errStack: err?.stack,
    }, null, 2));
    throw new AlpacaError(
      err?.message || `Failed to fetch bars for ${symbol}`,
      err?.status || 502
    );
  }
}

export async function getAssets(activeOnly = true) {
  try {
    const client = await getClient();
    return await client.getAssets({
      status: activeOnly ? 'active' : undefined,
    });
  } catch (err: any) {
    throw new AlpacaError(err.message || 'Failed to fetch assets', 502);
  }
}

export async function getClock() {
  try {
    const client = await getClient();
    return await client.getClock();
  } catch (err: any) {
    throw new AlpacaError(err.message || 'Failed to fetch market clock', 502);
  }
}

export async function getCalendar({ start, end }: { start?: string; end?: string } = {}) {
  try {
    const client = await getClient();
    return await client.getCalendar({ start, end });
  } catch (err: any) {
    throw new AlpacaError(err.message || 'Failed to fetch calendar', 502);
  }
}

export async function getPortfolioHistory({ period, timeframe }: { period?: string; timeframe?: string } = {}) {
  try {
    const client = await getClient();
    // @ts-ignore — alpaca-trade-api typings may not include this
    return await client.getPortfolioHistory({ period: period || '1M', timeframe: timeframe || '1D' });
  } catch (err: any) {
    throw new AlpacaError(err.message || 'Failed to fetch portfolio history', 502);
  }
}

// ── Exports ─────────────────────────────────────────────────────
export { TRADING_MODE, IS_PAPER };
