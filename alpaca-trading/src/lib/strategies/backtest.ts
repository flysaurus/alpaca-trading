// ── Backtest Engine ─────────────────────────────────────────────
// Runs strategies against historical data to simulate performance

export interface Bar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface BacktestResult {
  symbol: string;
  strategy: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  final_capital: number;
  total_return: number;
  annualized_return: number;
  maxDrawdown: number;
  win_rate: number;
  total_trades: number;
  trades: BacktestTrade[];
}

export interface BacktestTrade {
  date: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  pnl: number;
  cumulative_pnl: number;
}

// ── Fetch Historical Bars ───────────────────────────────────────
async function fetchBars(symbol: string, startDate: string, endDate: string): Promise<Bar[]> {
  try {
    const res = await fetch(`/api/bars?symbol=${symbol}&start=${startDate}&end=${endDate}&timeframe=1Day`);
    const json = await res.json();
    
    if (!json.bars) return [];
    
    return json.bars as Bar[];
  } catch {
    return [];
  }
}

// ── Run Simple Buy-and-Hold Backtest ────────────────────────────
export async function runBuyAndHoldBacktest(
  symbol: string,
  startDate: string,
  endDate: string,
  initialCapital: number
): Promise<BacktestResult> {
  const bars = await fetchBars(symbol, startDate, endDate);
  
  if (bars.length < 2) {
    return {
      symbol,
      strategy: 'buy-and-hold',
      start_date: startDate,
      end_date: endDate,
      initial_capital: initialCapital,
      final_capital: initialCapital,
      total_return: 0,
      annualized_return: 0,
      maxDrawdown: 0,
      win_rate: 0,
      total_trades: 1,
      trades: [],
    };
  }
  
  let shares = 0;
  let cash = initialCapital;
  let maxPortfolio = initialCapital;
  let maxDrawdown = 0;
  let cumulativePnl = 0;
  const trades: BacktestTrade[] = [];
  
  // Initial buy
  const initialPrice = bars[0].c;
  shares = Math.floor(cash / initialPrice);
  cash -= shares * initialPrice;
  
  trades.push({
    date: bars[0].t,
    symbol,
    side: 'buy',
    qty: shares,
    price: initialPrice,
    pnl: 0,
    cumulative_pnl: 0,
  });
  
  // Hold until end
  for (let i = 1; i < bars.length; i++) {
    const currentPrice = bars[i].c;
    const portfolioValue = cash + shares * currentPrice;
    
    // Track max drawdown
    if (portfolioValue > maxPortfolio) {
      maxPortfolio = portfolioValue;
    }
    const drawdown = maxPortfolio - portfolioValue;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
    
    cumulativePnl = portfolioValue - initialCapital;
  }
  
  // Final sell (at end)
  const finalPrice = bars[bars.length - 1].c;
  cash += shares * finalPrice;
  shares = 0;
  
  const finalPortfolio = cash;
  const totalReturn = (finalPortfolio - initialCapital) / initialCapital;
  
  // Calculate annualized return
  const days = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24);
  const years = days / 365;
  const annualizedReturn = years > 0 ? Math.pow(1 + totalReturn, 1 / years) - 1 : 0;
  
  return {
    symbol,
    strategy: 'buy-and-hold',
    start_date: startDate,
    end_date: endDate,
    initial_capital: initialCapital,
    final_capital: finalPortfolio,
    total_return: totalReturn,
    annualized_return: annualizedReturn,
    maxDrawdown: maxDrawdown,
    win_rate: 0, // Not applicable for single trade
    total_trades: 2,
    trades: [
      ...trades,
      {
        date: bars[bars.length - 1].t,
        symbol,
        side: 'sell',
        qty: bars.length - 1,
        price: finalPrice,
        pnl: (finalPrice - initialPrice) * shares,
        cumulative_pnl: (finalPrice - initialPrice) * shares,
      },
    ],
  };
}

// ── Run DCA Backtest ────────────────────────────────────────────
export async function runDCABacktest(
  symbol: string,
  startDate: string,
  endDate: string,
  initialCapital: number,
  amountPerOrder: number,
  frequency: 'daily' | 'weekly' | 'monthly'
): Promise<BacktestResult> {
  const bars = await fetchBars(symbol, startDate, endDate);
  
  let shares = 0;
  let cash = initialCapital;
  let maxPortfolio = initialCapital;
  let maxDrawdown = 0;
  const trades: BacktestTrade[] = [];
  let lastOrderDate: string | null = null;
  
  for (const bar of bars) {
    const currentPrice = bar.c;
    const portfolioValue = cash + shares * currentPrice;
    
    // Track max drawdown
    if (portfolioValue > maxPortfolio) {
      maxPortfolio = portfolioValue;
    }
    const drawdown = maxPortfolio - portfolioValue;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
    
    // Check if it's time for DCA order
    const shouldOrder = shouldExecuteDCA(bar.t, lastOrderDate, frequency);
    if (shouldOrder && cash >= amountPerOrder) {
      const orderShares = Math.floor(amountPerOrder / currentPrice);
      if (orderShares > 0) {
        cash -= orderShares * currentPrice;
        shares += orderShares;
        
        trades.push({
          date: bar.t,
          symbol,
          side: 'buy',
          qty: orderShares,
          price: currentPrice,
          pnl: 0,
          cumulative_pnl: portfolioValue - initialCapital,
        });
        
        lastOrderDate = bar.t;
      }
    }
  }
  
  // Final liquidation
  const finalPrice = bars[bars.length - 1].c;
  cash += shares * finalPrice;
  
  const finalPortfolio = cash;
  const totalReturn = (finalPortfolio - initialCapital) / initialCapital;
  
  const days = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24);
  const years = days / 365;
  const annualizedReturn = years > 0 ? Math.pow(1 + totalReturn, 1 / years) - 1 : 0;
  
  return {
    symbol,
    strategy: 'dca',
    start_date: startDate,
    end_date: endDate,
    initial_capital: initialCapital,
    final_capital: finalPortfolio,
    total_return: totalReturn,
    annualized_return: annualizedReturn,
    maxDrawdown: maxDrawdown,
    win_rate: 0,
    total_trades: trades.length,
    trades,
  };
}

// ── Helper: Check DCA Schedule ──────────────────────────────────
function shouldExecuteDCA(currentDate: string, lastOrderDate: string | null, frequency: 'daily' | 'weekly' | 'monthly'): boolean {
  if (!lastOrderDate) return true;
  
  const now = new Date(currentDate);
  const last = new Date(lastOrderDate);
  
  switch (frequency) {
    case 'daily':
      return now.getDate() !== last.getDate();
    case 'weekly':
      return now.getTime() - last.getTime() >= 7 * 24 * 60 * 60 * 1000;
    case 'monthly':
      return now.getMonth() !== last.getMonth();
  }
  
  return false;
}
