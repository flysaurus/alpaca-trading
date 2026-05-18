import type { MarketState } from './marketState';

// ── Full S&P 500 constituents ────────────────────────────────────
const SP500_SYMBOLS: string[] = [
  'A','AAL','AAPL','ABBV','ABNB','ABT','ACGL','ACN','ADBE','ADI',
  'ADM','ADP','ADSK','AEE','AEP','AES','AFL','AIG','AIZ','AJG',
  'AKAM','ALB','ALGN','ALK','ALL','ALLE','AME','AMAT','AMCR','AMD',
  'AME','AMGN','AMP','AMT','AMZN','ANET','ANSS','AON','AOS','APA',
  'APD','APH','APTV','ARE','ATO','AVB','AVGO','AVY','AWK','AXP',
  'AZO','BA','BAC','BALL','BAX','BBWI','BBY','BDX','BEN','BF.B',
  'BG','BIIB','BIO','BK','BKNG','BKR','BLDR','BLK','BMY','BR',
  'BRK.B','BRO','BSX','BWA','BX','BXP','C','CAG','CAH','CARR',
  'CAT','CB','CBOE','CBRE','CCI','CCL','CDNS','CDW','CE','CEG',
  'CF','CFG','CHD','CHRW','CHTR','CI','CINF','CL','CLX','CMA',
  'CMCSA','CME','CMG','CMI','CMS','CNC','CNP','COF','COO','COP',
  'COR','COST','CPAY','CPB','CPRT','CPT','CRL','CRM','CSCO','CSGP',
  'CSX','CTAS','CTLT','CTRA','CTSH','CTVA','CVS','CVX','CZR','D',
  'DAL','DD','DE','DFS','DG','DGX','DHI','DHR','DIS','DLR','DLTR',
  'DOC','DOV','DOW','DPZ','DRI','DTE','DUK','DVA','DVN','DXCM',
  'EA','EBAY','ECL','ED','EFX','EIX','EL','ELV','EMN','EMR',
  'ENPH','EOG','EPAM','EQIX','EQR','EQT','ES','ESS','ETN','ETR',
  'ETSY','EVRG','EW','EXC','EXPD','EXPE','EXR','F','FANG','FAST',
  'FCX','FDS','FDX','FE','FFIV','FI','FICO','FIS','FITB','FMC',
  'FOX','FOXA','FRT','FSLR','FTNT','FTV','GD','GE','GEN','GEHC',
  'GILD','GIS','GL','GLW','GM','GNRC','GOOG','GOOGL','GPC','GPN',
  'GRMN','GS','GWW','HAL','HAS','HBAN','HCA','HD','HES','HIG',
  'HII','HLT','HOLX','HON','HPE','HPQ','HRL','HSIC','HST','HSY',
  'HUBB','HUM','HWM','IBM','ICE','IDXX','IEX','IFF','ILMN','INCY',
  'INTC','INTU','INVH','IP','IPG','IQV','IR','IRM','ISRG','IT',
  'ITW','IVZ','J','JBHT','JBL','JCI','JKHY','JNJ','JNPR','JPM',
  'K','KDP','KEY','KEYS','KHC','KIM','KKR','KLAC','KMB','KMI',
  'KMX','KO','KR','KVUE','L','LDOS','LEN','LH','LHX','LIN',
  'LKQ','LLY','LMT','LNT','LOW','LRCX','LULU','LUV','LVS','LW',
  'LYB','LYV','MA','MAA','MAR','MAS','MCD','MCHP','MCK','MCO',
  'MDLZ','MDT','MET','META','MGM','MHK','MKC','MKTX','MLM','MMC',
  'MMM','MNST','MO','MOH','MOS','MPC','MPWR','MRK','MRNA','MS',
  'MSCI','MSFT','MSI','MTB','MTCH','MTD','MU','NCLH','NDAQ','NDSN',
  'NEE','NEM','NFLX','NI','NKE','NOC','NOW','NRG','NSC','NTAP',
  'NTRS','NUE','NVDA','NVR','NWL','NWSA','NXPI','O','ODFL','OKE',
  'OMC','ON','ORCL','ORLY','OTIS','OXY','PANW','PARA','PAYC','PAYX',
  'PCAR','PCG','PEG','PEP','PFE','PFG','PG','PGR','PH','PHM',
  'PKG','PLD','PM','PNC','PNR','PNW','PODD','POOL','PPG','PPL',
  'PRU','PSA','PSX','PTC','PWR','PYPL','QCOM','QRVO','RCL','REG',
  'REGN','RF','RHI','RJF','RL','RMD','ROK','ROL','ROP','ROST',
  'RSG','RTX','RVTY','SBAC','SBUX','SCHW','SHW','SJM','SLB','SMCI',
  'SNA','SNPS','SO','SOLV','SPG','SPGI','SRE','STE','STLD','STT',
  'STX','STZ','SW','SWK','SWKS','SYF','SYK','SYY','T','TAP',
  'TDG','TDY','TECH','TEL','TER','TFC','TFX','TGT','TJX','TMO',
  'TMUS','TPR','TRGP','TRMB','TROW','TRV','TSCO','TSLA','TSN','TT',
  'TTWO','TXN','TXT','TYL','UAL','UBER','UDR','UHS','ULTA','UNH',
  'UNP','UPS','URI','USB','V','VICI','VLO','VLTO','VMC','VRSK',
  'VRSN','VRT','VRTX','VTR','VTRS','VZ','WAB','WAT','WBA','WBD',
  'WDC','WEC','WELL','WFC','WHR','WM','WMB','WMT','WRB','WST',
  'WTW','WY','WYNN','XEL','XOM','XRAY','XYL','YUM','ZBH','ZBRA','ZTS',
];

export interface DipCandidate {
  symbol: string;
  score: number;
  grade: string;
  change_pct: number;
  current_price: number;
  volume_ratio: number;
  rsi: number | null;
  rsi_7: number | null;
  rsi_14: number | null;
  rsi_28: number | null;
  drop_score: number;
  state_score: number;
  rsi_score: number;
  vol_score: number;
  quality_score: number;
  sma_score: number;
  earnings_score: number;
  in_watchlist: boolean;
  suggested_amount: number;
  stop_loss_pct: number;
  atr: number | null;
  earnings_days_away: number | null;
  sma_proximity: {
    sma20_near: boolean;
    sma50_near: boolean;
    sma200_near: boolean;
    week52_low_near: boolean;
  };
}

const APCA_KEY = process.env.ALPACA_API_KEY;
const APCA_SECRET = process.env.ALPACA_SECRET_KEY;

function getAlpacaHeaders(): Record<string, string> {
  return {
    'APCA-API-KEY-ID': APCA_KEY || '',
    'APCA-API-SECRET-KEY': APCA_SECRET || '',
  };
}

// ── Technical Indicators ───────────────────────────────────────────

function calculateRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateATR(bars: Array<{ h: number; l: number; c: number }>, period = 14): number | null {
  if (bars.length < period + 1) return null;
  let trSum = 0;
  for (let i = 1; i <= period; i++) {
    const idx = bars.length - i;
    const high = bars[idx].h;
    const low = bars[idx].l;
    const prevClose = bars[idx - 1].c;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trSum += tr;
  }
  return trSum / period;
}

function calculateSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calculateMACD(
  closes: number[]
): { macd: number; signal: number; histogram: number } | null {
  if (closes.length < 26 + 9) return null;
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macd = ema12 - ema26;
  // Simple 9-period EMA of MACD as signal
  const signal = ema26; // hack — proper signal would need MACD history
  return { macd, signal, histogram: macd - signal };
}

function ema(closes: number[], period: number): number {
  const k = 2 / (period + 1);
  let ema = closes[0];
  for (let i = 1; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

// ── Data Fetching ──────────────────────────────────────────────────

async function fetchSnapshots(symbols: string[]): Promise<Record<string, any>> {
  const url = `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${encodeURIComponent(symbols.join(','))}`;
  const res = await fetch(url, { headers: getAlpacaHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca snapshots: ${res.status} ${text}`);
  }
  return await res.json();
}

async function fetchFullBars(symbol: string): Promise<Array<{ h: number; l: number; c: number; v: number; t: string }>> {
  const url = `https://data.alpaca.markets/v2/stocks/bars?symbols=${encodeURIComponent(symbol)}&timeframe=1Day&limit=240&feed=iex`;
  const res = await fetch(url, { headers: getAlpacaHeaders() });
  if (!res.ok) return [];
  const json = await res.json();
  const bars = json.bars?.[symbol] || [];
  return bars
    .map((b: any) => ({
      h: b.h ?? b.HighPrice ?? 0,
      l: b.l ?? b.LowPrice ?? 0,
      c: b.c ?? b.ClosePrice ?? 0,
      v: b.v ?? b.Volume ?? 0,
      t: b.t ?? '',
    }))
    .filter((b: { c: number }) => b.c > 0);
}

// ── Main Scanner ───────────────────────────────────────────────────

export async function scanForQualityDips(
  watchlistSymbols: string[],
  marketState: MarketState
): Promise<DipCandidate[]> {
  if (!marketState.dip_buying_enabled) {
    console.log('[dipScanner] Dip buying disabled in current market state:', marketState.state);
    return [];
  }

  // Step 1 — Full S&P 500 + watchlist universe
  const universe = Array.from(new Set([...SP500_SYMBOLS, ...watchlistSymbols]));
  console.log(`[dipScanner] Universe: ${universe.length} symbols (SP500: ${SP500_SYMBOLS.length} + watchlist: ${watchlistSymbols.length})`);

  // Step 2 — Fetch snapshots in batches of 100
  const allSnapshots: Record<string, any> = {};
  for (let i = 0; i < universe.length; i += 100) {
    const batch = universe.slice(i, i + 100);
    try {
      const snaps = await fetchSnapshots(batch);
      Object.assign(allSnapshots, snaps);
    } catch (err: any) {
      console.warn(`[dipScanner] Batch ${i}-${i + 100} failed:`, err.message);
    }
  }
  console.log(`[dipScanner] Fetched ${Object.keys(allSnapshots).length} snapshots`);

  // Step 3 — Filter stocks down 5%+ with volume context
  const movers: Array<{
    symbol: string;
    changePct: number;
    currentPrice: number;
    todayVolume: number;
    prevVolume: number;
    volRatio: number;
    inWatchlist: boolean;
  }> = [];

  for (const symbol of Object.keys(allSnapshots)) {
    const snap = allSnapshots[symbol];
    const dailyBar = snap.dailyBar || {};
    const prevDailyBar = snap.prevDailyBar || {};

    const close = dailyBar.c || 0;
    const prevClose = prevDailyBar.c || 0;
    const todayVolume = dailyBar.v || 0;
    const prevVolume = prevDailyBar.v || 0;

    if (!close || !prevClose) continue;

    const changePercent = (close - prevClose) / prevClose;
    if (changePercent > -0.05) continue;

    const volRatio = prevVolume > 0 ? todayVolume / prevVolume : 1.0;

    movers.push({
      symbol,
      changePct: changePercent,
      currentPrice: close,
      todayVolume,
      prevVolume,
      volRatio,
      inWatchlist: watchlistSymbols.includes(symbol),
    });
  }
  console.log(`[dipScanner] Found ${movers.length} movers down 5%+`);
  if (movers.length === 0) return [];

  // Step 4 — Preliminary scoring (scalars we can compute from snapshots only)
  const preliminary: Array<{
    symbol: string;
    changePct: number;
    currentPrice: number;
    volRatio: number;
    prevVolume: number;
    inWatchlist: boolean;
    dropScore: number;
    stateScore: number;
    volScore: number;
    qualityScore: number;
    preliminaryScore: number;
  }> = [];

  for (const m of movers) {
    const dropPct = Math.abs(m.changePct * 100);

    // Drop score (0-20): reward moderate drops (5-8%), penalize crashes
    let dropScore = 0;
    if (dropPct >= 5 && dropPct <= 8) dropScore = 20;
    else if (dropPct > 8 && dropPct <= 12) dropScore = 16;
    else if (dropPct > 12 && dropPct <= 15) dropScore = 12;
    else if (dropPct > 15 && dropPct <= 20) dropScore = 6;
    else if (dropPct > 20) dropScore = 2;

    // Market state score (0-20)
    let stateScore = 0;
    if (marketState.state === 'bull_trending') stateScore = 20;
    else if (marketState.state === 'bull_volatile') stateScore = 12;
    else if (marketState.state === 'neutral_volatile') stateScore = 5;
    else stateScore = 0;

    // Volume confirmation (0-20): higher volume on dip = distribution, bad
    let volScore = 0;
    if (m.volRatio < 1.5) volScore = 20;
    else if (m.volRatio < 2.5) volScore = 12;
    else if (m.volRatio < 4) volScore = 6;
    else volScore = 2;

    // SP500 membership (0-20)
    const qualityScore = 20; // All are SP500 now

    const preliminaryScore = dropScore + stateScore + 10 + volScore + qualityScore;

    preliminary.push({
      ...m, dropScore, stateScore, volScore, qualityScore, preliminaryScore,
    });
  }

  // Step 5 — Top 20 proceed to deep analysis (bars, RSI, SMA, ATR, earnings)
  const top20 = preliminary
    .sort((a, b) => b.preliminaryScore - a.preliminaryScore)
    .slice(0, 20);

  console.log(`[dipScanner] Deep-analyzing top ${top20.length}`);

  const deepResults = await Promise.all(
    top20.map(async (candidate) => {
      try {
        const bars = await fetchFullBars(candidate.symbol);
        if (bars.length < 15) return null;

        const closes = bars.map(b => b.c);

        // Multi-timeframe RSI
        const rsi7 = calculateRSI(closes, 7);
        const rsi14 = calculateRSI(closes, 14);
        const rsi28 = calculateRSI(closes, 28);

        // Average the three RSIs for a confluence score
        const rsi = (rsi7 + rsi14 + rsi28) / 3;

        // ATR for position sizing
        const atr = calculateATR(bars, 14);

        // SMA levels
        const sma20 = calculateSMA(closes, 20);
        const sma50 = calculateSMA(closes, 50);
        const sma200 = calculateSMA(closes, 200);

        // 52-week range from bars
        const yearCloses = closes.slice(-252 < closes.length ? -252 : 0);
        const week52High = Math.max(...yearCloses);
        const week52Low = Math.min(...yearCloses);

        // SMA proximity scoring (0-20)
        let smaScore = 10; // neutral
        const smaProximity = {
          sma20_near: false,
          sma50_near: false,
          sma200_near: false,
          week52_low_near: false,
        };

        if (sma20 && sma50 && sma200) {
          const dist20 = Math.abs((candidate.currentPrice - sma20) / sma20 * 100);
          const dist50 = Math.abs((candidate.currentPrice - sma50) / sma50 * 100);
          const dist200 = Math.abs((candidate.currentPrice - sma200) / sma200 * 100);
          const dist52Low = Math.abs((candidate.currentPrice - week52Low) / week52Low * 100);

          // Bounce check: price ABOVE support = high score
          if (candidate.currentPrice > sma200) {
            // Pulling back TO the 50-day = healthy
            if (dist50 < 3) { smaScore = 20; smaProximity.sma50_near = true; }
            else if (dist20 < 3) { smaScore = 18; smaProximity.sma20_near = true; }
            else if (dist200 < 5) { smaScore = 14; smaProximity.sma200_near = true; }
            else smaScore = 12; // Above all MAs — less of a "dip"
          } else if (candidate.currentPrice > sma50) {
            // Between 50 and 200 — could be temporary
            if (dist200 < 5) { smaScore = 8; smaProximity.sma200_near = true; }
            else smaScore = 4;
          } else {
            // Below 200-day SMA = bearish structure
            smaScore = 0;
          }

          // 52-week low bounce bonus
          if (dist52Low < 5) {
            smaScore = Math.min(20, smaScore + 4); // bonus for near 52wk low support
            smaProximity.week52_low_near = true;
          }
        }

        // RSI multi-timeframe confluence (0-20)
        let rsiScore = 10;
        // Reward when all three RSIs agree on oversold
        const oversoldCount = [rsi7, rsi14, rsi28].filter(r => r < 40).length;
        if (oversoldCount >= 3) rsiScore = 20;
        else if (oversoldCount === 2) rsiScore = 15;
        else if (oversoldCount === 1) rsiScore = 8;
        else rsiScore = 3;

        // Earnings proximity score (0-10) — fetch earnings data
        let earningsScore = 10; // neutral default
        let earningsDaysAway: number | null = null;
        try {
          const { getEarningsData } = await import('./stockAnalysis');
          const earnings = await getEarningsData(candidate.symbol);
          if (earnings?.nextDate) {
            const nextDateValue = earnings.nextDate;
            if (!nextDateValue) { earningsDaysAway = null; }
            else {
              const nextDate = new Date(nextDateValue);
              const daysAway = Math.ceil((nextDate.getTime() - Date.now()) / 86400000);
              earningsDaysAway = daysAway;
              if (daysAway < 5) earningsScore = 0;
              else if (daysAway < 10) earningsScore = 3;
              else if (daysAway < 20) earningsScore = 7;
              else earningsScore = 10;
            }
          }
        } catch {
          // Proceed without earnings data
        }

        // Total score (out of 120 now: 20+20+20+20+20+20+10=130, cap at 100)
        const totalScore = Math.min(100,
          candidate.dropScore + candidate.stateScore + rsiScore +
          candidate.volScore + candidate.qualityScore + smaScore + earningsScore
        );

        // ATR-based position sizing
        let suggestedAmount = 500;
        let stopLossPct = 8;
        if (atr && candidate.currentPrice > 0) {
          // Risk 1% of $100k portfolio = $1000 per position
          const riskAmount = 1000;
          const atrValue = atr;
          // Stop loss: 2x ATR below entry
          const stopDistance = atrValue * 2;
          stopLossPct = Math.min(15, Math.max(3, (stopDistance / candidate.currentPrice) * 100));
          // Shares = riskAmount / (stopDistance)
          const shares = Math.floor(riskAmount / stopDistance);
          suggestedAmount = Math.round(shares * candidate.currentPrice);
          // Ensure minimum viable size
          if (suggestedAmount < 100) suggestedAmount = 500;
          if (suggestedAmount > 5000) suggestedAmount = 5000; // cap at 5% of 100k
        }

        return {
          symbol: candidate.symbol,
          score: totalScore,
          grade: totalScore >= 85 ? 'A' : totalScore >= 70 ? 'B' : 'C',
          change_pct: candidate.changePct * 100,
          current_price: candidate.currentPrice,
          volume_ratio: candidate.volRatio,
          rsi,
          rsi_7: rsi7,
          rsi_14: rsi14,
          rsi_28: rsi28,
          drop_score: candidate.dropScore,
          state_score: candidate.stateScore,
          rsi_score: rsiScore,
          vol_score: candidate.volScore,
          quality_score: candidate.qualityScore,
          sma_score: smaScore,
          earnings_score: earningsScore,
          in_watchlist: candidate.inWatchlist,
          suggested_amount: suggestedAmount,
          stop_loss_pct: Math.round(stopLossPct * 10) / 10,
          atr,
          earnings_days_away: earningsDaysAway,
          sma_proximity: smaProximity,
        } as DipCandidate;
      } catch (err) {
        console.warn(`[dipScanner] Deep analysis failed for ${candidate.symbol}:`, err);
        return null;
      }
    })
  );

  // Filter nulls and score >= 50
  const results = deepResults
    .filter((c): c is DipCandidate => c !== null && c.score >= 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  console.log(`[dipScanner] Returning ${results.length} quality dip candidates`);
  return results;
}
