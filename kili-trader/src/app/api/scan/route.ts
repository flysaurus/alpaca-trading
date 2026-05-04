import { NextResponse } from 'next/server';
import { getBars, getAssets } from '@/lib/alpaca';
import { scanStock, sortScanResults } from '@/lib/scanner';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const watchlist = searchParams.get('watchlist')?.split(',') || [
    'SPY', 'QQQ', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'AMD',
    'COIN', 'PLTR', 'ARKK', 'IWM', 'XLF', 'XLE', 'TLT', 'GLD', 'VIX',
  ];

  try {
    // Get 30 days of daily bars for technical analysis
    const bars = await getBars(watchlist, '1D', 30);

    const results = [];
    for (const symbol of watchlist) {
      const stockBars = bars[symbol] || [];
      const scan = scanStock(symbol, stockBars);
      if (scan) {
        results.push(scan);
      }
    }

    return NextResponse.json({
      scanned: watchlist.length,
      signals: sortScanResults(results),
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Scan failed' },
      { status: 500 }
    );
  }
}
