// Direct REST API calls to Alpaca (bypass unreliable SDK for market data)

const keyId = process.env.ALPACA_API_KEY || '';
const secretKey = process.env.ALPACA_SECRET_KEY || '';
const dataBase = process.env.TRADING_MODE === 'live'
  ? 'https://data.alpaca.markets'
  : 'https://data.sandbox.alpaca.markets'; // paper still uses data.alpaca.markets

const headers = {
  'APCA-API-KEY-ID': keyId,
  'APCA-API-SECRET-KEY': secretKey,
  'Accept': 'application/json',
};

interface Snapshot {
  symbol: string;
  latestTrade?: { p: number; s: number; t: string; x: string };
  dailyBar?: { c: number; h: number; l: number; n: number; o: number; t: string; v: number; vw: number };
  prevDailyBar?: { c: number; h: number; l: number; n: number; o: number; t: string; v: number; vw: number };
  minuteBar?: any;
}

export async function getSnapshots(symbols: string[]): Promise<Record<string, Snapshot>> {
  const url = `${dataBase}/v2/stocks/snapshots?symbols=${symbols.join(',')}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Alpaca snapshots: ${res.status} ${await res.text()}`);
  return await res.json();
}
