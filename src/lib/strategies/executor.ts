// ── Strategy Executor ───────────────────────────────────────────
// Server-side execution engine for DCA, Rebalance, and Momentum strategies
// Places real Alpaca orders and logs executions to Supabase

import { getClient, DbStrategy } from '@/lib/supabase';
import { sendTelegramMessage } from '@/lib/telegram';

const ALPACA_TRADE_URL = 'https://paper-api.alpaca.markets';
const ALPACA_DATA_URL = 'https://data.alpaca.markets';

function getAlpacaHeaders() {
  return {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY || '',
    'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY || '',
    'Content-Type': 'application/json',
  };
}

// ── Market Hours Check ──────────────────────────────────────────
export function isMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  const hour = et.getHours();
  const minute = et.getMinutes();
  const time = hour * 60 + minute;

  // Mon-Fri, 9:30 AM - 4:00 PM ET
  const isWeekday = day >= 1 && day <= 5;
  const isMarketHours = time >= 570 && time <= 960; // 9:30 = 570, 16:00 = 960
  return isWeekday && isMarketHours;
}

export function isPreMarket(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  const hour = et.getHours();
  const minute = et.getMinutes();
  const time = hour * 60 + minute;
  return day >= 1 && day <= 5 && time >= 240 && time < 570; // 4:00 AM - 9:30 AM ET
}

// ── Alpaca API Helpers ──────────────────────────────────────────
async function placeAlpacaOrder(order: {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type?: 'market' | 'limit';
  time_in_force?: 'day' | 'gtc' | 'ioc';
}): Promise<{ id: string; status: string } | null> {
  try {
    const res = await fetch(`${ALPACA_TRADE_URL}/v2/orders`, {
      method: 'POST',
      headers: getAlpacaHeaders(),
      body: JSON.stringify({
        symbol: order.symbol,
        qty: order.qty,
        side: order.side,
        type: order.type || 'market',
        time_in_force: order.time_in_force || 'day',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[Executor] Order failed: ${err}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error('[Executor] Order exception:', err);
    return null;
  }
}

async function getAlpacaQuote(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${ALPACA_DATA_URL}/v2/stocks/${symbol}/quotes/latest?feed=iex`,
      { headers: getAlpacaHeaders() }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.quote?.bp || data.quote?.ap || null;
  } catch {
    return null;
  }
}

async function getAlpacaAccount() {
  const res = await fetch(`${ALPACA_TRADE_URL}/v2/account`, {
    headers: getAlpacaHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch account');
  return res.json();
}

async function getAlpacaPositions() {
  const res = await fetch(`${ALPACA_TRADE_URL}/v2/positions`, {
    headers: getAlpacaHeaders(),
  });
  if (!res.ok) return [];
  return res.json();
}

// ── Execution Logger ────────────────────────────────────────────
async function logExecution(params: {
  strategy_id: string;
  user_id: string;
  action: string;
  symbol?: string;
  qty?: number;
  side?: string;
  order_id?: string;
  status: 'success' | 'failed' | 'skipped';
  details?: Record<string, any>;
}) {
  try {
    await getClient().from('strategy_executions').insert({
      strategy_id: params.strategy_id,
      user_id: params.user_id,
      action: params.action,
      symbol: params.symbol,
      qty: params.qty,
      side: params.side,
      order_id: params.order_id,
      status: params.status,
      details: params.details || {},
      executed_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Executor] Failed to log execution:', err);
  }
}

// ── Telegram Notifier ───────────────────────────────────────────
async function notifyExecution(
  strategyName: string,
  action: string,
  symbol?: string,
  qty?: number,
  side?: string,
  status?: string
) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return;

  const emoji = status === 'success' ? '✅' : status === 'failed' ? '❌' : '⏭️';
  const lines = [
    `${emoji} <b>Strategy Execution</b>`,
    `<b>Strategy:</b> ${strategyName}`,
    `<b>Action:</b> ${action}`,
  ];

  if (symbol) lines.push(`<b>Symbol:</b> ${symbol}`);
  if (side && qty) lines.push(`<b>Order:</b> ${side.toUpperCase()} ${qty} shares`);
  if (status) lines.push(`<b>Status:</b> ${status}`);

  await sendTelegramMessage({
    chatId,
    text: lines.join('\n'),
    parseMode: 'HTML',
  });
}

// ── DCA Execution ───────────────────────────────────────────────
async function executeDCA(strategy: DbStrategy): Promise<string[]> {
  const params = strategy.params;
  const symbol = params.symbol;
  const amountUsd = params.amount_usd;
  const frequency = params.frequency;

  if (!symbol || !amountUsd || !frequency) {
    await logExecution({
      strategy_id: strategy.id,
      user_id: strategy.user_id,
      action: 'dca_invalid_config',
      status: 'skipped',
      details: { reason: 'Missing required params' },
    });
    return ['skipped'];
  }

  // Check if it's time to execute
  const now = new Date();
  const lastExec = params.last_execution ? new Date(params.last_execution) : null;
  const nextExec = params.next_execution ? new Date(params.next_execution) : null;

  if (nextExec && now < nextExec) {
    return ['not_due'];
  }

  // Get current price and calculate shares
  const price = await getAlpacaQuote(symbol);
  if (!price || price <= 0) {
    await logExecution({
      strategy_id: strategy.id,
      user_id: strategy.user_id,
      action: 'dca_no_price',
      symbol,
      status: 'failed',
      details: { reason: 'Could not fetch price' },
    });
    await notifyExecution(strategy.name, 'DCA Failed', symbol, undefined, 'buy', 'failed');
    return ['failed'];
  }

  const shares = Math.floor(amountUsd / price);
  if (shares <= 0) {
    await logExecution({
      strategy_id: strategy.id,
      user_id: strategy.user_id,
      action: 'dca_insufficient_funds',
      symbol,
      status: 'skipped',
      details: { price, amount: amountUsd, reason: 'Insufficient for 1 share' },
    });
    return ['skipped'];
  }

  // Place order
  const order = await placeAlpacaOrder({
    symbol,
    qty: shares,
    side: 'buy',
    type: 'market',
    time_in_force: 'day',
  });

  // Calculate next execution
  const nextDate = new Date();
  switch (frequency) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
  }
  nextDate.setHours(13, 30, 0, 0); // 9:30 AM ET = 13:30 UTC

  // Update strategy params
  await getClient()
    .from('strategies')
    .update({
      params: {
        ...params,
        last_execution: now.toISOString(),
        next_execution: nextDate.toISOString(),
      },
    })
    .eq('id', strategy.id);

  if (order) {
    await logExecution({
      strategy_id: strategy.id,
      user_id: strategy.user_id,
      action: 'dca_executed',
      symbol,
      qty: shares,
      side: 'buy',
      order_id: order.id,
      status: 'success',
      details: { price, amount: amountUsd, next_execution: nextDate.toISOString() },
    });
    await notifyExecution(strategy.name, 'DCA Executed', symbol, shares, 'buy', 'success');
    return ['success'];
  } else {
    await logExecution({
      strategy_id: strategy.id,
      user_id: strategy.user_id,
      action: 'dca_order_failed',
      symbol,
      qty: shares,
      side: 'buy',
      status: 'failed',
      details: { price, amount: amountUsd },
    });
    await notifyExecution(strategy.name, 'DCA Order Failed', symbol, shares, 'buy', 'failed');
    return ['failed'];
  }
}

// ── Rebalance Execution ─────────────────────────────────────────
async function executeRebalance(strategy: DbStrategy): Promise<string[]> {
  const params = strategy.params;
  const targetAllocations = params.target_allocations;
  const threshold = params.threshold || 0.05;
  const mode = params.mode || 'full';

  if (!targetAllocations) {
    await logExecution({
      strategy_id: strategy.id,
      user_id: strategy.user_id,
      action: 'rebalance_invalid_config',
      status: 'skipped',
      details: { reason: 'Missing target_allocations' },
    });
    return ['skipped'];
  }

  // Fetch account and positions
  let account, positions;
  try {
    account = await getAlpacaAccount();
    positions = await getAlpacaPositions();
  } catch (err) {
    await logExecution({
      strategy_id: strategy.id,
      user_id: strategy.user_id,
      action: 'rebalance_account_error',
      status: 'failed',
      details: { reason: 'Failed to fetch account/positions' },
    });
    return ['failed'];
  }

  const equity = parseFloat(account.equity || 0);
  const cash = parseFloat(account.cash || 0);
  const portfolioValue = equity;

  if (portfolioValue <= 0) {
    await logExecution({
      strategy_id: strategy.id,
      user_id: strategy.user_id,
      action: 'rebalance_no_equity',
      status: 'skipped',
      details: { equity },
    });
    return ['skipped'];
  }

  // Build allocations
  const allocations: Array<{
    symbol: string;
    current_weight: number;
    target_weight: number;
    current_value: number;
    currentPrice: number;
    qty: number;
    drift: number;
  }> = [];

  for (const pos of positions) {
    const mv = parseFloat(pos.market_value || 0);
    const weight = mv / portfolioValue;
    const target = targetAllocations[pos.symbol] || 0;
    allocations.push({
      symbol: pos.symbol,
      current_weight: weight,
      target_weight: target,
      current_value: mv,
      currentPrice: parseFloat(pos.current_price || pos.lastday_price || 0),
      qty: parseFloat(pos.qty || 0),
      drift: Math.abs(weight - target),
    });
  }

  // Check if any symbols in target are not in portfolio
  for (const [symbol, target] of Object.entries(targetAllocations)) {
    if (!allocations.find(a => a.symbol === symbol)) {
      const price = await getAlpacaQuote(symbol);
      allocations.push({
        symbol,
        current_weight: 0,
        target_weight: target as number,
        current_value: 0,
        currentPrice: price || 0,
        qty: 0,
        drift: target as number,
      });
    }
  }

  // Check drift
  const needsRebalance = allocations.some(a => a.drift > threshold);

  if (!needsRebalance) {
    await logExecution({
      strategy_id: strategy.id,
      user_id: strategy.user_id,
      action: 'rebalance_no_drift',
      status: 'skipped',
      details: { maxDrift: Math.max(...allocations.map(a => a.drift)), threshold },
    });
    return ['skipped'];
  }

  // Generate orders
  const orders: Array<{ symbol: string; qty: number; side: 'buy' | 'sell' }> = [];
  let estimatedCost = 0;

  for (const alloc of allocations) {
    const targetValue = alloc.target_weight * portfolioValue;
    const diff = targetValue - alloc.current_value;

    if (Math.abs(diff) < 10) continue;

    if (diff > 0) {
      const qty = Math.floor(diff / alloc.currentPrice);
      if (qty > 0) {
        orders.push({ symbol: alloc.symbol, qty, side: 'buy' });
        estimatedCost += qty * alloc.currentPrice;
      }
    } else if (diff < 0 && mode === 'full') {
      const qty = Math.floor(Math.abs(diff) / alloc.currentPrice);
      if (qty > 0) {
        orders.push({ symbol: alloc.symbol, qty, side: 'sell' });
      }
    }
  }

  // Check cash for buys
  if (mode !== 'full' && estimatedCost > cash) {
    await logExecution({
      strategy_id: strategy.id,
      user_id: strategy.user_id,
      action: 'rebalance_insufficient_cash',
      status: 'skipped',
      details: { estimatedCost, cash },
    });
    return ['skipped'];
  }

  // Execute orders
  const results: string[] = [];
  for (const order of orders) {
    const placed = await placeAlpacaOrder({
      symbol: order.symbol,
      qty: order.qty,
      side: order.side,
      type: 'market',
      time_in_force: 'day',
    });

    if (placed) {
      await logExecution({
        strategy_id: strategy.id,
        user_id: strategy.user_id,
        action: 'rebalance_order_placed',
        symbol: order.symbol,
        qty: order.qty,
        side: order.side,
        order_id: placed.id,
        status: 'success',
        details: { mode, threshold },
      });
      await notifyExecution(strategy.name, 'Rebalance Order', order.symbol, order.qty, order.side, 'success');
      results.push('success');
    } else {
      await logExecution({
        strategy_id: strategy.id,
        user_id: strategy.user_id,
        action: 'rebalance_order_failed',
        symbol: order.symbol,
        qty: order.qty,
        side: order.side,
        status: 'failed',
        details: { mode, threshold },
      });
      await notifyExecution(strategy.name, 'Rebalance Order Failed', order.symbol, order.qty, order.side, 'failed');
      results.push('failed');
    }
  }

  return results.length > 0 ? results : ['skipped'];
}

// ── Momentum Execution ──────────────────────────────────────────
async function executeMomentum(strategy: DbStrategy): Promise<string[]> {
  const params = strategy.params;
  const universe = params.universe;
  const topN = params.top_n || 3;
  const bottomN = params.bottom_n || 0;
  const lookback = params.lookback_days || 30;

  if (!universe || universe.length === 0) {
    await logExecution({
      strategy_id: strategy.id,
      user_id: strategy.user_id,
      action: 'momentum_invalid_config',
      status: 'skipped',
      details: { reason: 'Missing universe' },
    });
    return ['skipped'];
  }

  // Fetch positions
  let positions;
  try {
    positions = await getAlpacaPositions();
  } catch {
    await logExecution({
      strategy_id: strategy.id,
      user_id: strategy.user_id,
      action: 'momentum_positions_error',
      status: 'failed',
    });
    return ['failed'];
  }

  const currentSymbols = positions.map((p: any) => p.symbol);

  // Calculate momentum scores
  const scores: Array<{ symbol: string; score: number; price: number }> = [];

  for (const symbol of universe) {
    try {
      const res = await fetch(
        `${ALPACA_DATA_URL}/v2/stocks/${symbol}/bars?timeframe=1Day&limit=${Math.max(lookback, 90)}&feed=iex`,
        { headers: getAlpacaHeaders() }
      );
      if (!res.ok) continue;

      const data = await res.json();
      const bars = data.bars || [];
      if (bars.length < 10) continue;

      const prices = bars.map((b: any) => b.c);
      const current = prices[prices.length - 1];

      const r1d = prices.length >= 2 ? (prices[prices.length - 1] - prices[prices.length - 2]) / prices[prices.length - 2] : 0;
      const r1w = prices.length >= 6 ? (prices[prices.length - 1] - prices[prices.length - 6]) / prices[prices.length - 6] : 0;
      const r1m = prices.length >= 22 ? (prices[prices.length - 1] - prices[prices.length - 22]) / prices[prices.length - 22] : 0;
      const r3m = prices.length >= 66 ? (prices[prices.length - 1] - prices[prices.length - 66]) / prices[prices.length - 66] : 0;

      const score = r1d * 0.1 + r1w * 0.2 + r1m * 0.3 + r3m * 0.4;
      scores.push({ symbol, score, price: current });
    } catch (err) {
      console.warn(`[Executor] Momentum calc failed for ${symbol}:`, err);
    }
  }

  scores.sort((a, b) => b.score - a.score);

  const toBuy = scores.slice(0, topN);
  const toSell = bottomN > 0 ? scores.slice(-bottomN).filter(s => currentSymbols.includes(s.symbol)) : [];

  // Only execute if there's rotation needed
  const newTopSymbols = toBuy.map(s => s.symbol);
  const currentTopInPortfolio = currentSymbols.filter((s: string) => newTopSymbols.includes(s));

  // If top holdings haven't changed, skip
  if (currentTopInPortfolio.length >= topN && toSell.length === 0) {
    await logExecution({
      strategy_id: strategy.id,
      user_id: strategy.user_id,
      action: 'momentum_no_rotation',
      status: 'skipped',
      details: { currentTop: currentTopInPortfolio, newTop: newTopSymbols },
    });
    return ['skipped'];
  }

  // Get account for cash calc
  let account;
  try {
    account = await getAlpacaAccount();
  } catch {
    return ['failed'];
  }

  const cash = parseFloat(account.cash || 0);
  const cashPerStock = cash / topN;

  const results: string[] = [];

  // Sell first
  for (const sell of toSell) {
    const pos = positions.find((p: any) => p.symbol === sell.symbol);
    if (!pos) continue;

    const qty = Math.floor(parseFloat(pos.qty || 0));
    if (qty <= 0) continue;

    const order = await placeAlpacaOrder({
      symbol: sell.symbol,
      qty,
      side: 'sell',
      type: 'market',
      time_in_force: 'day',
    });

    if (order) {
      await logExecution({
        strategy_id: strategy.id,
        user_id: strategy.user_id,
        action: 'momentum_sell',
        symbol: sell.symbol,
        qty,
        side: 'sell',
        order_id: order.id,
        status: 'success',
        details: { score: sell.score },
      });
      await notifyExecution(strategy.name, 'Momentum Sell', sell.symbol, qty, 'sell', 'success');
      results.push('success');
    } else {
      results.push('failed');
    }
  }

  // Then buy
  for (const buy of toBuy) {
    const qty = Math.floor(cashPerStock / buy.price);
    if (qty <= 0) continue;

    const order = await placeAlpacaOrder({
      symbol: buy.symbol,
      qty,
      side: 'buy',
      type: 'market',
      time_in_force: 'day',
    });

    if (order) {
      await logExecution({
        strategy_id: strategy.id,
        user_id: strategy.user_id,
        action: 'momentum_buy',
        symbol: buy.symbol,
        qty,
        side: 'buy',
        order_id: order.id,
        status: 'success',
        details: { score: buy.score, price: buy.price },
      });
      await notifyExecution(strategy.name, 'Momentum Buy', buy.symbol, qty, 'buy', 'success');
      results.push('success');
    } else {
      results.push('failed');
    }
  }

  return results.length > 0 ? results : ['skipped'];
}

// ── Main Executor ───────────────────────────────────────────────
export async function executeStrategies(options?: {
  strategyTypes?: ('dca' | 'rebalance' | 'momentum' | 'mean_reversion')[];
  dryRun?: boolean;
}): Promise<{
  executed: number;
  failed: number;
  skipped: number;
  results: Array<{
    strategyId: string;
    name: string;
    type: string;
    results: string[];
  }>;
}> {
  const supabase = getClient();

  // Fetch all active strategies
  const { data: strategies, error } = await supabase
    .from('strategies')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('[Executor] Failed to fetch strategies:', error);
    throw error;
  }

  const toExecute = strategies || [];
  const types = options?.strategyTypes;
  const filtered = types ? toExecute.filter(s => types.includes(s.type)) : toExecute;

  let executed = 0;
  let failed = 0;
  let skipped = 0;
  const allResults: Array<{ strategyId: string; name: string; type: string; results: string[] }> = [];

  for (const strategy of filtered) {
    if (!strategy.is_active) continue;

    let results: string[] = [];

    try {
      switch (strategy.type) {
        case 'dca':
          results = await executeDCA(strategy);
          break;
        case 'rebalance':
          results = await executeRebalance(strategy);
          break;
        case 'momentum':
          results = await executeMomentum(strategy);
          break;
        default:
          results = ['skipped'];
      }
    } catch (err) {
      console.error(`[Executor] Strategy ${strategy.name} failed:`, err);
      results = ['failed'];
      await logExecution({
        strategy_id: strategy.id,
        user_id: strategy.user_id,
        action: 'executor_error',
        status: 'failed',
        details: { error: (err as Error).message },
      });
    }

    for (const r of results) {
      if (r === 'success') executed++;
      else if (r === 'failed') failed++;
      else skipped++;
    }

    allResults.push({
      strategyId: strategy.id,
      name: strategy.name,
      type: strategy.type,
      results,
    });
  }

  return { executed, failed, skipped, results: allResults };
}
