import { NextResponse } from 'next/server';
import { getPositions } from '@/lib/alpaca';

export async function GET() {
  try {
    const positions = await getPositions();

    return NextResponse.json({
      positions: positions.map((p: any) => ({
        symbol: p.symbol,
        qty: Number(p.qty),
        marketValue: Number(p.market_value),
        avgEntryPrice: Number(p.avg_entry_price),
        currentPrice: Number(p.current_price),
        unrealizedPL: Number(p.unrealized_pl),
        unrealizedPLPercent: Number(p.unrealized_plpc) * 100,
        changeToday: Number(p.change_today) * 100,
        side: Number(p.qty) >= 0 ? 'long' : 'short',
      })),
      count: positions.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch positions' },
      { status: 500 }
    );
  }
}
