import { NextResponse } from 'next/server';

// ── Cron API Handler ──────────────────────────────────────────────
// Protected by CRON_SECRET environment variable
// Cron jobs configured in vercel.json call this endpoint

export async function POST(req: Request) {
  const { secret, type } = await req.json();
  
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }
  
  // Validate cron type
  const validTypes = ['dca', 'rebalance', 'momentum', 'digest'];
  if (!type || !validTypes.includes(type)) {
    return NextResponse.json({ error: 'Invalid cron type' }, { status: 400 });
  }
  
  // Import and call the appropriate scheduler function
  // const { isMarketHours } = await import('@/lib/scheduler');
  
  switch (type) {
    case 'dca':
      return NextResponse.json({ 
        action: 'dca_check',
        timestamp: new Date().toISOString(),
        executed: false, // Would be true if any orders placed
      });
    case 'rebalance':
      return NextResponse.json({ 
        action: 'rebalance_check',
        timestamp: new Date().toISOString(),
        needsRebalance: false, // Would be true if any rebalancing needed
      });
    case 'momentum':
      return NextResponse.json({ 
        action: 'momentum_update',
        timestamp: new Date().toISOString(),
        updated: true,
      });
    case 'digest':
      return NextResponse.json({ 
        action: 'pre_market_digest',
        timestamp: new Date().toISOString(),
        macroEvents: [], // Would contain upcoming events
        news: [], // Would contain news summary
      });
    default:
      return NextResponse.json({ error: 'Unknown cron type' }, { status: 400 });
  }
}
