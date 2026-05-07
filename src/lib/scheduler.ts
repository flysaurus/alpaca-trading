// ── Strategy Scheduler ────────────────────────────────────────────
// Runs on Vercel Cron Jobs during market hours (9:30-16:00 ET)
// Environment: Vercel Cron Jobs with CRON_SECRET for security

import { NextResponse } from 'next/server';

// ── Cron Schedule (Market Hours: 9:30 AM - 4:00 PM ET) ────────────
// UTC times (ET is UTC-4 or UTC-5 depending on DST):
// - Every 15 min: 13:30, 13:45, 14:00, ..., 20:00 UTC (during summer)
// - Every 15 min: 14:30, 14:45, 15:00, ..., 21:00 UTC (during winter)
// - Every hour:   13:00, 14:00, ..., 20:00 UTC
// - Before market: 12:30 UTC (8:30 AM ET, 30 min before open)

const MARKET_HOURS = {
  startET: 9,  // 9:30 AM ET
  endET: 16,   // 4:00 PM ET
  openBeforeET: 9, // 8:30 AM ET (30 min before)
};

// ── Check Market Hours ────────────────────────────────────────────
function isMarketHours(date: Date): boolean {
  // Convert to ET timezone
  const etDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = etDate.getHours();
  const minute = etDate.getMinutes();
  
  // Market hours: 9:30 AM - 4:00 PM ET
  if (hour < 9) return false;
  if (hour > 15) return false;
  if (hour === 9 && minute < 30) return false;
  
  return true;
}

// ── Cron Job Endpoints ────────────────────────────────────────────

// 1. DCA Check - Every 15 minutes during market hours
export async function POST_dca(req: Request) {
  const { secret } = await req.json();
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }
  
  if (!isMarketHours(new Date())) {
    return NextResponse.json({ message: 'Outside market hours' });
  }
  
  // Check DCA schedules and execute if due
  // This would fetch schedules from storage and place orders
  // For now, just log
  
  return NextResponse.json({ 
    action: 'dca_check',
    timestamp: new Date().toISOString(),
    executed: false, // Would be true if any orders placed
  });
}

// 2. Rebalance Check - Every 15 minutes during market hours
export async function POST_rebalance(req: Request) {
  const { secret } = await req.json();
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }
  
  if (!isMarketHours(new Date())) {
    return NextResponse.json({ message: 'Outside market hours' });
  }
  
  // Check portfolio drift against target allocations
  // If drift > threshold, generate rebalance orders
  
  return NextResponse.json({ 
    action: 'rebalance_check',
    timestamp: new Date().toISOString(),
    needsRebalance: false, // Would be true if any rebalancing needed
  });
}

// 3. Momentum Update - Every hour during market hours
export async function POST_momentum(req: Request) {
  const { secret } = await req.json();
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }
  
  if (!isMarketHours(new Date())) {
    return NextResponse.json({ message: 'Outside market hours' });
  }
  
  // Recalculate momentum scores for universe
  // This would call momentum.calculateMomentum(universe)
  
  return NextResponse.json({ 
    action: 'momentum_update',
    timestamp: new Date().toISOString(),
    updated: true,
  });
}

// 4. Macro & News Digest - Before market open (8:30 AM ET)
export async function POST_digest(req: Request) {
  const { secret } = await req.json();
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }
  
  // Check if it's before market open (8:30-9:00 AM ET)
  const date = new Date();
  const etDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = etDate.getHours();
  const minute = etDate.getMinutes();
  
  if (hour !== 8 || minute > 30) {
    return NextResponse.json({ message: 'Not pre-market' });
  }
  
  // Fetch macro events, news, and create digest
  // This would call macro.ts and news.ts functions
  
  return NextResponse.json({ 
    action: 'pre_market_digest',
    timestamp: new Date().toISOString(),
    macroEvents: [], // Would contain upcoming events
    news: [], // Would contain news summary
  });
}

// ── Cron Handler (Single Endpoint) ────────────────────────────────

export async function POST(req: Request) {
  const { secret, type } = await req.json();
  
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }
  
  switch (type) {
    case 'dca':
      return POST_dca(req);
    case 'rebalance':
      return POST_rebalance(req);
    case 'momentum':
      return POST_momentum(req);
    case 'digest':
      return POST_digest(req);
    default:
      return NextResponse.json({ error: 'Unknown cron type' }, { status: 400 });
  }
}
