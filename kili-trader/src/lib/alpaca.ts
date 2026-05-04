import Alpaca from '@alpacahq/alpaca-trade-api';

function getClient() {
  const keyId = process.env.ALPACA_API_KEY;
  const secretKey = process.env.ALPACA_SECRET_KEY;
  const paper = process.env.ALPACA_PAPER !== 'false';

  if (!keyId || !secretKey) {
    throw new Error('Missing Alpaca API keys. Set ALPACA_API_KEY and ALPACA_SECRET_KEY in .env.local');
  }

  return new Alpaca({
    keyId,
    secretKey,
    paper,
    usePolygon: false,
  });
}

export async function getAccount() {
  return getClient().getAccount();
}

export async function getPositions() {
  return getClient().getPositions();
}

export async function getBars(symbols: string[], timeframe = '1D', limit = 100) {
  const client = getClient();
  const bars: Record<string, any[]> = {};

  for (const symbol of symbols) {
    try {
      const resp = await client.getBarsV2(
        symbol,
        { timeframe, limit },
        alpacaConfiguration
      );
      const data = [];
      for await (const bar of resp) {
        data.push(bar);
      }
      bars[symbol] = data;
    } catch {
      bars[symbol] = [];
    }
  }

  return bars;
}

export async function getLatestQuotes(symbols: string[]) {
  const client = getClient();
  const quotes: Record<string, any> = {};

  for (const symbol of symbols) {
    try {
      const quote = await client.getLatestQuote(symbol);
      quotes[symbol] = quote;
    } catch {
      quotes[symbol] = null;
    }
  }

  return quotes;
}

export async function submitOrder(params: {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type?: 'market' | 'limit' | 'stop' | 'stop_limit';
  timeInForce?: 'day' | 'gtc' | 'ioc';
  stopPrice?: number;
  limitPrice?: number;
}) {
  const client = getClient();

  // Safety: enforce paper trading unless explicitly overridden
  if (!process.env.ALPACA_PAPER || process.env.ALPACA_PAPER === 'true') {
    console.log('[PAPER] Order would execute:', params);
  }

  return client.createOrder({
    symbol: params.symbol,
    qty: params.qty,
    side: params.side,
    type: params.type || 'market',
    time_in_force: params.timeInForce || 'day',
    ...(params.stopPrice ? { stop_price: params.stopPrice } : {}),
    ...(params.limitPrice ? { limit_price: params.limitPrice } : {}),
  });
}

export async function getAssets(activeOnly = true) {
  return getClient().getAssets({ status: activeOnly ? 'active' : undefined });
}

export async function getClock() {
  return getClient().getClock();
}

// Work around type issue
const alpacaConfiguration = {} as any;
