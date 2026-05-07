import { AlpacaError } from './alpaca';

// ── Configuration ───────────────────────────────────────────────
// Note: MAX_ORDER_VALUE and MAX_DAILY_ORDERS guards were removed per user request.
// Orders go through to Alpaca where their own limits apply.

const ALLOWED_SYMBOLS = (process.env.ALLOWED_SYMBOLS || '')
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

// ── Validation ──────────────────────────────────────────────────
export interface OrderInput {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  estimatedPrice?: number;
}

export function validateOrder(order: OrderInput): { valid: boolean; error?: string } {
  // Symbol
  if (!order.symbol || typeof order.symbol !== 'string') {
    return { valid: false, error: 'Symbol is required' };
  }

  const symbol = order.symbol.trim().toUpperCase();

  // Allowed symbols list
  if (ALLOWED_SYMBOLS.length > 0 && !ALLOWED_SYMBOLS.includes(symbol)) {
    return {
      valid: false,
      error: `Symbol ${symbol} is not in the allowed list`,
    };
  }

  // Quantity
  if (!order.qty || order.qty <= 0 || !Number.isFinite(order.qty)) {
    return { valid: false, error: 'Quantity must be a positive number' };
  }

  // Side
  if (order.side !== 'buy' && order.side !== 'sell') {
    return { valid: false, error: 'Side must be "buy" or "sell"' };
  }

  return { valid: true };
}

// ── Re-exports for convenience ──────────────────────────────────
export { ALLOWED_SYMBOLS };
