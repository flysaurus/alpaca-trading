// ── Types ───────────────────────────────────────────────────────
export interface RebalanceConfig {
  target_allocations: Record<string, number>; // Symbol -> weight (0-1)
  threshold: number; // Rebalance if drift > threshold (e.g., 0.05 = 5%)
  mode: 'full' | 'cash-only'; // full: buy/sell, cash-only: buy only
  active: boolean;
}

export interface Allocation {
  symbol: string;
  current_weight: number;
  target_weight: number;
  drift: number;
  currentPrice: number;
  action?: 'buy' | 'sell';
  target_value?: number;
}

export interface RebalancePlan {
  allocations: Allocation[];
  needs_rebalance: boolean;
  totalDrift: number;
  estimated_cost?: number;
}

// ── Portfolio Allocation ────────────────────────────────────────
export interface Position {
  symbol: string;
  marketValue: number;
  qty: number;
  currentPrice: number;
}

export async function getCurrentAllocations(positions: Position[], portfolioValue: number): Promise<Allocation[]> {
  if (portfolioValue <= 0) return [];
  
  const allocations: Allocation[] = [];
  
  for (const pos of positions) {
    const weight = pos.marketValue / portfolioValue;
    allocations.push({
      symbol: pos.symbol,
      current_weight: weight,
      target_weight: 0, // Will be set from config
      drift: 0,
      currentPrice: pos.currentPrice,
    });
  }
  
  return allocations;
}

// ── Check Rebalance Needed ──────────────────────────────────────
export function checkRebalanceNeeded(
  currentAllocations: Allocation[],
  config: RebalanceConfig
): RebalancePlan {
  const allocations: Allocation[] = [];
  let totalDrift = 0;
  let needsRebalance = false;
  
  for (const alloc of currentAllocations) {
    const target = config.target_allocations[alloc.symbol] || 0;
    const drift = Math.abs(alloc.current_weight - target);
    
    allocations.push({
      ...alloc,
      target_weight: target,
      drift,
    });
    
    totalDrift += drift;
    
    if (drift > config.threshold) {
      needsRebalance = true;
    }
  }
  
  return {
    allocations,
    needs_rebalance: needsRebalance,
    totalDrift,
  };
}

// ── Generate Rebalance Plan ─────────────────────────────────────
export function generateRebalancePlan(
  currentAllocations: Allocation[],
  config: RebalanceConfig,
  portfolioValue: number,
  cashAvailable: number
): RebalancePlan & { orders: Array<{ symbol: string; qty: number; side: 'buy' | 'sell' }> } {
  const plan = checkRebalanceNeeded(currentAllocations, config);
  
  if (!plan.needs_rebalance) {
    return { ...plan, orders: [] };
  }
  
  const orders: Array<{ symbol: string; qty: number; side: 'buy' | 'sell' }> = [];
  let totalValue = portfolioValue;
  
  // Calculate target values
  const targetValues: Record<string, number> = {};
  for (const alloc of plan.allocations) {
    targetValues[alloc.symbol] = alloc.target_weight * totalValue;
  }
  
  // Calculate buy/sell quantities
  for (const alloc of plan.allocations) {
    const currentVal = alloc.current_weight * totalValue;
    const targetVal = targetValues[alloc.symbol] || 0;
    const diff = targetVal - currentVal;
    
    if (Math.abs(diff) < 10) continue; // Ignore tiny changes
    
    if (diff > 0) {
      // Need to buy
      if (config.mode === 'full' || config.mode === 'cash-only') {
        orders.push({
          symbol: alloc.symbol,
          qty: Math.floor(diff / alloc.currentPrice),
          side: 'buy',
        });
      }
    } else if (diff < 0 && config.mode === 'full') {
      // Need to sell (only in full mode)
      orders.push({
        symbol: alloc.symbol,
        qty: Math.floor(Math.abs(diff) / alloc.currentPrice),
        side: 'sell',
      });
    }
  }
  
  // Calculate estimated cost
  let estimatedCost = 0;
  for (const order of orders) {
    if (order.side === 'buy') {
      const price = plan.allocations.find(a => a.symbol === order.symbol)?.currentPrice || 0;
      estimatedCost += order.qty * price;
    }
  }
  
  return {
    ...plan,
    orders,
    estimated_cost: estimatedCost,
  };
}

// ── Execute Rebalance ───────────────────────────────────────────
export async function executeRebalance(config: RebalanceConfig, positions: Position[], cashAvailable: number): Promise<{ success: boolean; orders: Array<{ symbol: string; qty: number; side: 'buy' | 'sell' }> }> {
  const allocations = await getCurrentAllocations(positions, positions.reduce((s, p) => s + p.marketValue, 0) + cashAvailable);
  const plan = generateRebalancePlan(allocations, config, positions.reduce((s, p) => s + p.marketValue, 0) + cashAvailable, cashAvailable);
  
  if (!plan.needs_rebalance || plan.orders.length === 0) {
    return { success: true, orders: [] };
  }
  
  // Execute orders
  const executedOrders: Array<{ symbol: string; qty: number; side: 'buy' | 'sell' }> = [];
  
  for (const order of plan.orders) {
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: order.symbol,
          qty: order.qty,
          side: order.side,
          type: 'market',
          timeInForce: 'day',
        }),
      });
      
      const json = await res.json();
      if (json.success) {
        executedOrders.push(order);
      }
    } catch (err) {
      console.error(`[Rebalance] Order error for ${order.symbol}:`, err);
    }
  }
  
  return { success: true, orders: executedOrders };
}
