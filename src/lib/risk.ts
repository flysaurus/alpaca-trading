export interface RiskParameters {
  maxPositionSize: number; // % of portfolio
  maxDailyLoss: number; // % of portfolio
  stopLossPercent: number;
  trailingStopPercent: number;
  enableShorting: boolean;
  allowAfterHours: boolean;
}

export const DEFAULT_RISK: RiskParameters = {
  maxPositionSize: 0.05, // 5%
  maxDailyLoss: 0.02, // 2%
  stopLossPercent: 0.05, // 5%
  trailingStopPercent: 0.08, // 8%
  enableShorting: false,
  allowAfterHours: false,
};

export function calculatePositionSize(
  portfolioValue: number,
  riskPerTrade: number,
  entryPrice: number,
  stopLossPrice: number
): { shares: number; riskAmount: number; positionValue: number } {
  const riskAmount = portfolioValue * riskPerTrade;
  const riskPerShare = Math.abs(entryPrice - stopLossPrice);

  if (riskPerShare === 0) {
    return { shares: 0, riskAmount: 0, positionValue: 0 };
  }

  const shares = Math.floor(riskAmount / riskPerShare);
  const positionValue = shares * entryPrice;

  return { shares, riskAmount, positionValue };
}

export function calculateStopLoss(
  entryPrice: number,
  side: 'long' | 'short',
  stopLossPercent: number
): number {
  if (side === 'long') {
    return entryPrice * (1 - stopLossPercent);
  }
  return entryPrice * (1 + stopLossPercent);
}

export function checkRiskLimits(
  portfolioValue: number,
  openPositions: any[],
  newOrder: { symbol: string; side: 'buy' | 'sell'; notional: number; qty?: number },
  risk: RiskParameters = DEFAULT_RISK,
  account?: { equity: number; last_equity: number },
  clock?: { is_open: boolean }
): { allowed: boolean; reason?: string } {
  // Check after-hours trading
  if (!risk.allowAfterHours && clock && !clock.is_open) {
    return { allowed: false, reason: 'After-hours trading is disabled' };
  }

  // Check daily loss limit
  if (account && risk.maxDailyLoss > 0) {
    const dailyLoss = account.equity - account.last_equity;
    const dailyLossPercent = portfolioValue > 0 ? Math.abs(dailyLoss) / portfolioValue : 0;
    if (dailyLoss < 0 && dailyLossPercent >= risk.maxDailyLoss) {
      return {
        allowed: false,
        reason: `Daily loss ${(dailyLossPercent * 100).toFixed(1)}% exceeds max ${(risk.maxDailyLoss * 100).toFixed(0)}%`,
      };
    }
  }

  // Check position size
  const positionValue = newOrder.side === 'buy' ? newOrder.notional : 0;
  const positionSizeRatio = positionValue / portfolioValue;
  if (positionSizeRatio > risk.maxPositionSize) {
    return {
      allowed: false,
      reason: `Position ${(positionSizeRatio * 100).toFixed(1)}% exceeds max ${(risk.maxPositionSize * 100).toFixed(0)}%`,
    };
  }

  // Check shorting — only block if selling a symbol we DON'T own
  if (newOrder.side === 'sell' && !risk.enableShorting) {
    const pos = openPositions.find((p: any) => p.symbol === newOrder.symbol);
    const ownedQty = pos ? Math.abs(Number(pos.qty || pos.position_qty || 0)) : 0;
    const sellQty = newOrder.qty || 0;
    if (ownedQty <= 0 || sellQty > ownedQty) {
      return { allowed: false, reason: 'Short selling is disabled' };
    }
  }

  return { allowed: true };
}

export function calculatePortfolioRisk(
  positions: Array<{ market_value: number; unrealized_pl: number }>,
  portfolioValue: number
): {
  totalExposure: number;
  unrealizedPnL: number;
  pnlPercent: number;
  largestPosition: number;
  largestPositionPercent: number;
} {
  const totalExposure = positions.reduce((sum, p) => sum + Math.abs(Number(p.market_value)), 0);
  const unrealizedPnL = positions.reduce((sum, p) => sum + Number(p.unrealized_pl), 0);

  const largestPosition = positions.length > 0
    ? Math.max(...positions.map((p) => Math.abs(Number(p.market_value))))
    : 0;

  return {
    totalExposure,
    unrealizedPnL,
    pnlPercent: portfolioValue > 0 ? (unrealizedPnL / portfolioValue) * 100 : 0,
    largestPosition,
    largestPositionPercent: portfolioValue > 0 ? (largestPosition / portfolioValue) * 100 : 0,
  };
}
