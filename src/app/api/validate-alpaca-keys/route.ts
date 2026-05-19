import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { apiKey, secretKey } = await request.json();

    if (!apiKey || !secretKey) {
      return NextResponse.json(
        { error: 'API key and secret are required' },
        { status: 400 }
      );
    }

    // Test connection with Alpaca
    const response = await fetch('https://api.alpaca.markets/v2/account', {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': secretKey,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[validate-alpaca] Failed:', response.status, text);
      return NextResponse.json(
        { error: 'Invalid Alpaca credentials. Check your API key and secret.' },
        { status: 401 }
      );
    }

    const account = await response.json();
    console.log('[validate-alpaca] Valid keys for account:', account.id);

    return NextResponse.json({
      valid: true,
      account: {
        id: account.id,
        status: account.status,
        buyingPower: account.buying_power,
        portfolioValue: account.portfolio_value,
      },
    });
  } catch (err: any) {
    console.error('[validate-alpaca] Error:', err);
    return NextResponse.json(
      { error: 'Connection failed. Is Alpaca reachable?' },
      { status: 500 }
    );
  }
}
