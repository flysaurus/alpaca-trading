/* ── Risk Score Calculator ───────────────────────────────────────
   0-100 score from 5 factors: concentration, cash, volatility,
   RSI extremes, diversification
───────────────────────────────────────────────────────────────*/

export interface EnrichedPosition {
  symbol: string;
  qty: number;
  market_value: number;
  current_price: number;
  rsi?: number;
  unrealized_plpc?: number;
  [key: string]: any;
}

export interface AccountContext {
  equity?: number | string;
  cash?: number | string;
  total_equity?: number | string;
  [key: string]: any;
}

export interface RiskFactor {
  score: number;
  detail: string;
}

export interface RiskScore {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  label: 'Low' | 'Moderate' | 'Elevated' | 'High' | 'Critical';
  factors: {
    concentration: RiskFactor;
    cash_buffer: RiskFactor;
    volatility: RiskFactor;
    rsi_extremes: RiskFactor;
    diversification: RiskFactor;
  };
  top_risk: string;
}

export function calculateRiskScore(
  positions: EnrichedPosition[],
  account: AccountContext,
  vix: number | null = null
): RiskScore {
  const equity = parseFloat(String(account?.equity || account?.total_equity || 0));
  const cash = parseFloat(String(account?.cash || 0));

  // ── 1. Concentration Risk (0-25) ──
  let concentrationScore = 0;
  let concentrationDetail = 'No positions';
  if (equity > 0 && positions.length > 0) {
    const maxPos = Math.max(...positions.map((p) => Number(p.market_value || 0)));
    const maxPct = (maxPos / equity) * 100;
    if (maxPct < 10) {
      concentrationScore = 0;
      concentrationDetail = `Largest position ${maxPct.toFixed(1)}% of equity — well diversified`;
    } else if (maxPct <= 20) {
      concentrationScore = 8;
      concentrationDetail = `Largest position ${maxPct.toFixed(1)}% of equity — mild concentration`;
    } else if (maxPct <= 30) {
      concentrationScore = 16;
      concentrationDetail = `Largest position ${maxPct.toFixed(1)}% of equity — significant concentration`;
    } else {
      concentrationScore = 25;
      concentrationDetail = `Largest position ${maxPct.toFixed(1)}% of equity — highly concentrated`;
    }
  }

  // ── 2. Cash Buffer (0-20) ──
  let cashScore = 0;
  let cashDetail = 'No equity data';
  if (equity > 0) {
    const cashPct = (cash / equity) * 100;
    if (cashPct > 20) {
      cashScore = 0;
      cashDetail = `Cash ${cashPct.toFixed(1)}% — strong buffer`;
    } else if (cashPct >= 10) {
      cashScore = 5;
      cashDetail = `Cash ${cashPct.toFixed(1)}% — adequate buffer`;
    } else if (cashPct >= 5) {
      cashScore = 12;
      cashDetail = `Cash ${cashPct.toFixed(1)}% — thin buffer`;
    } else {
      cashScore = 20;
      cashDetail = `Cash ${cashPct.toFixed(1)}% — very low buffer`;
    }
  }

  // ── 3. Volatility (0-25) ──
  let volScore = 0;
  let volDetail = 'No VIX data';
  const vixValue = vix ?? 0;
  if (vixValue > 0) {
    if (vixValue < 15) {
      volScore = 5;
      volDetail = `VIX ${vixValue.toFixed(1)} — low volatility environment`;
    } else if (vixValue <= 20) {
      volScore = 10;
      volDetail = `VIX ${vixValue.toFixed(1)} — moderate volatility`;
    } else if (vixValue <= 30) {
      volScore = 18;
      volDetail = `VIX ${vixValue.toFixed(1)} — elevated volatility`;
    } else {
      volScore = 25;
      volDetail = `VIX ${vixValue.toFixed(1)} — high volatility environment`;
    }
  }

  // ── 4. RSI Extremes (0-15) ──
  const overbought = positions.filter((p) => typeof p.rsi === 'number' && p.rsi > 70);
  let rsiScore = 0;
  let rsiDetail = 'No RSI data';
  if (positions.some((p) => typeof p.rsi === 'number')) {
    if (overbought.length === 0) {
      rsiScore = 0;
      rsiDetail = 'No overbought positions (RSI > 70)';
    } else if (overbought.length <= 2) {
      rsiScore = 5;
      rsiDetail = `${overbought.length} overbought position(s)`;
    } else {
      rsiScore = 15;
      rsiDetail = `${overbought.length} overbought positions — elevated risk`;
    }
  }

  // ── 5. Diversification (0-15) ──
  const posCount = positions.length;
  let divScore = 0;
  let divDetail = '';
  if (posCount > 15) {
    divScore = 0;
    divDetail = `${posCount} positions — well diversified`;
  } else if (posCount >= 10) {
    divScore = 4;
    divDetail = `${posCount} positions — reasonably diversified`;
  } else if (posCount >= 5) {
    divScore = 8;
    divDetail = `${posCount} positions — moderate concentration`;
  } else if (posCount > 0) {
    divScore = 15;
    divDetail = `${posCount} position(s) — highly concentrated`;
  } else {
    divScore = 15;
    divDetail = 'No positions — fully in cash';
  }

  // ── Total ──
  const total = concentrationScore + cashScore + volScore + rsiScore + divScore;

  // ── Grade ──
  let grade: RiskScore['grade'];
  let label: RiskScore['label'];
  if (total <= 20) { grade = 'A'; label = 'Low'; }
  else if (total <= 40) { grade = 'B'; label = 'Moderate'; }
  else if (total <= 60) { grade = 'C'; label = 'Elevated'; }
  else if (total <= 80) { grade = 'D'; label = 'High'; }
  else { grade = 'F'; label = 'Critical'; }

  // ── Top Risk Factor ──
  const factors = [
    { name: 'concentration', score: concentrationScore, detail: concentrationDetail },
    { name: 'cash buffer', score: cashScore, detail: cashDetail },
    { name: 'volatility', score: volScore, detail: volDetail },
    { name: 'RSI extremes', score: rsiScore, detail: rsiDetail },
    { name: 'diversification', score: divScore, detail: divDetail },
  ];
  const top = factors.reduce((a, b) => (a.score > b.score ? a : b));
  const topRisk = `Primary risk: ${top.name} (${top.detail})`;

  return {
    score: total,
    grade,
    label,
    factors: {
      concentration: { score: concentrationScore, detail: concentrationDetail },
      cash_buffer: { score: cashScore, detail: cashDetail },
      volatility: { score: volScore, detail: volDetail },
      rsi_extremes: { score: rsiScore, detail: rsiDetail },
      diversification: { score: divScore, detail: divDetail },
    },
    top_risk: topRisk,
  };
}
