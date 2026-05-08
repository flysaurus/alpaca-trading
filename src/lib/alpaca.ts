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
let _client: Alpaca | null = null;

function getClient(): Alpaca {
  if (_client) return _client;

  _client = new Alpaca({
    keyId: getKeyId(),
    secretKey: getSecretKey(),
    paper: IS_PAPER,
    usePolygon: false,
  });

  return _client;
}

// ── Account ─────────────────────────────────────────────────────
export async function getAccount() {
  try {
    return await getClient().getAccount();
  } catch (err: any) {
    throw new AlpacaError(err.message || 'Failed to fetch account', 502);
  }
}

// ── Positions ───────────────────────────────────────────────────
export async function getPositions() {
  try {
    return await getClient().getPositions();
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
    return await getClient().getOrders({
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
    const client = getClient();
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
    return await getClient().cancelOrder(orderId);
  } catch (err: any) {
    throw new AlpacaError(err.message || 'Failed to cancel order', 502);
  }
}

// ── Market Data ─────────────────────────────────────────────────
export async function getLatestQuotes(symbols: string[]) {
  const client = getClient();
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
    const client = getClient();
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
    throw new AlpacaError(err.message || `Failed to fetch bars for ${symbol}`, 502);
  }
}

export async function getAssets(activeOnly = true) {
  try {
    return await getClient().getAssets({
      status: activeOnly ? 'active' : undefined,
    });
  } catch (err: any) {
    throw new AlpacaError(err.message || 'Failed to fetch assets', 502);
  }
}

export async function getClock() {
  try {
    return await getClient().getClock();
  } catch (err: any) {
    throw new AlpacaError(err.message || 'Failed to fetch market clock', 502);
  }
}

export async function getCalendar({ start, end }: { start?: string; end?: string } = {}) {
  try {
    return await getClient().getCalendar({ start, end });
  } catch (err: any) {
    throw new AlpacaError(err.message || 'Failed to fetch calendar', 502);
  }
}

export async function getPortfolioHistory({ period, timeframe }: { period?: string; timeframe?: string } = {}) {
  try {
    const client = getClient();
    // @ts-ignore — alpaca-trade-api typings may not include this
    return await client.getPortfolioHistory({ period: period || '1M', timeframe: timeframe || '1D' });
  } catch (err: any) {
    throw new AlpacaError(err.message || 'Failed to fetch portfolio history', 502);
  }
}

// ── Exports ─────────────────────────────────────────────────────
export { TRADING_MODE, IS_PAPER };
