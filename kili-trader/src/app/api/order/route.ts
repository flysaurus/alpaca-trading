import { NextResponse } from 'next/server';
import { submitOrder, getAccount, getPositions } from '@/lib/alpaca';
import { checkRiskLimits, calculateStopLoss, DEFAULT_RISK } from '@/lib/risk';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { symbol, qty, side, type, stopPrice, limitPrice } = body;

    // Validate
    if (!symbol || !qty || !side) {
      return NextResponse.json({ error: 'Missing required fields: symbol, qty, side' }, { status: 400 });
    }

    // Get account info for risk checks
    const account = await getAccount();
    const positions = await getPositions();
    const portfolioValue = Number(account.portfolio_value);

    // Mock a quote for risk calc (in production, fetch real quote)
    const estimatedPrice = body.estimatedPrice || 100;
    const notional = qty * estimatedPrice;

    // Risk check
    const riskCheck = checkRiskLimits(
      portfolioValue,
      positions,
      { symbol, side, notional },
      DEFAULT_RISK
    );

    if (!riskCheck.allowed) {
      return NextResponse.json(
        { error: `Risk check failed: ${riskCheck.reason}` },
        { status: 403 }
      );
    }

    // Execute order
    const order = await submitOrder({
      symbol: symbol.toUpperCase(),
      qty: Number(qty),
      side,
      type: type || 'market',
      ...(stopPrice ? { stopPrice: Number(stopPrice) } : {}),
      ...(limitPrice ? { limitPrice: Number(limitPrice) } : {}),
    });

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        symbol: order.symbol,
        side: order.side,
        qty: Number(order.qty),
        type: order.type,
        status: order.status,
        createdAt: order.created_at,
      },
      risk: riskCheck,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Order failed' },
      { status: 500 }
    );
  }
}
