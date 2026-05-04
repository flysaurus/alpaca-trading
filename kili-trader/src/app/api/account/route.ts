import { NextResponse } from 'next/server';
import { getAccount, getPositions } from '@/lib/alpaca';
import { calculatePortfolioRisk } from '@/lib/risk';

export async function GET() {
  try {
    const [account, positions] = await Promise.all([
      getAccount(),
      getPositions(),
    ]);

    const portfolioValue = Number(account.portfolio_value);
    const risk = calculatePortfolioRisk(positions, portfolioValue);

    return NextResponse.json({
      account: {
        id: account.id,
        cash: Number(account.cash),
        portfolioValue,
        buyingPower: Number(account.buying_power),
        equity: Number(account.equity),
        initialMargin: Number(account.initial_margin),
        maintenanceMargin: Number(account.maintenance_margin),
        dayTradeCount: Number(account.daytrade_count),
        status: account.status,
      },
      positions: positions.map((p: any) => ({
        symbol: p.symbol,
        qty: Number(p.qty),
        marketValue: Number(p.market_value),
        avgEntryPrice: Number(p.avg_entry_price),
        currentPrice: Number(p.current_price),
        unrealizedPL: Number(p.unrealized_pl),
        unrealizedPLPercent: Number(p.unrealized_plpc) * 100,
        changeToday: Number(p.change_today) * 100,
      })),
      risk,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch account' },
      { status: 500 }
    );
  }
}
