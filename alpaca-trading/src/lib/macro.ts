import { parse, format, addDays, isAfter, isBefore } from 'date-fns';

// ── Types ───────────────────────────────────────────────────────
export interface MacroEvent {
  id: string;
  date: string;
  time?: string;
  title: string;
  category: 'fed' | 'earnings' | 'economic' | 'options' | 'geopolitical' | 'other';
  impact: 'high' | 'medium' | 'low';
  description?: string;
  source: string;
  symbols?: string[];
  actual?: string;
  forecast?: string;
  previous?: string;
}

// ── Known Recurring Events (2026) ───────────────────────────────
// Fed meetings, options expiry, known earnings seasons
const FOMC_DATES_2026: string[] = [
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-16',
];

const CPI_DATES_2026: string[] = [
  '2026-01-15', '2026-02-12', '2026-03-12', '2026-04-14',
  '2026-05-13', '2026-06-11', '2026-07-15', '2026-08-12',
  '2026-09-15', '2026-10-14', '2026-11-12', '2026-12-15',
];

const JOBS_DATES_2026: string[] = [
  '2026-01-09', '2026-02-06', '2026-03-06', '2026-04-03',
  '2026-05-08', '2026-06-05', '2026-07-03', '2026-08-07',
  '2026-09-04', '2026-10-02', '2026-11-06', '2026-12-04',
];

const PPI_DATES_2026: string[] = [
  '2026-01-14', '2026-02-13', '2026-03-13', '2026-04-14',
  '2026-05-13', '2026-06-12', '2026-07-14', '2026-08-13',
  '2026-09-11', '2026-10-14', '2026-11-13', '2026-12-11',
];

// Quarterly earnings seasons
const EARNINGS_SEASONS = [
  { name: 'Q1 2026 Earnings', start: '2026-04-13', end: '2026-05-16', peak: '2026-04-28' },
  { name: 'Q2 2026 Earnings', start: '2026-07-13', end: '2026-08-16', peak: '2026-07-27' },
  { name: 'Q3 2026 Earnings', start: '2026-10-13', end: '2026-11-14', peak: '2026-10-27' },
  { name: 'Q4 2026 Earnings', start: '2027-01-25', end: '2027-02-21', peak: '2027-02-05' },
];

// Monthly options expiry (third Friday)
function getMonthlyOptionsExpiry(year: number, month: number): string {
  const firstDay = new Date(year, month, 1);
  let fridayCount = 0;
  for (let d = 1; d <= 31; d++) {
    const date = new Date(year, month, d);
    if (date.getMonth() !== month) break;
    if (date.getDay() === 5) { // Friday
      fridayCount++;
      if (fridayCount === 3) return format(date, 'yyyy-MM-dd');
    }
  }
  return '';
}

// ── Build Event List ────────────────────────────────────────────
export async function getUpcomingEvents(days = 14): Promise<MacroEvent[]> {
  const now = new Date();
  const cutoff = addDays(now, days);
  const events: MacroEvent[] = [];

  // FOMC
  for (const d of FOMC_DATES_2026) {
    const date = parse(d, 'yyyy-MM-dd', new Date());
    if (isAfter(date, now) && isBefore(date, cutoff)) {
      events.push({
        id: `fomc-${d}`,
        date: d,
        time: '14:00 ET',
        title: 'FOMC Interest Rate Decision',
        category: 'fed',
        impact: 'high',
        description: 'Federal Reserve monetary policy decision. Markets watch for rate changes, QE/QT adjustments, and forward guidance.',
        source: 'Federal Reserve',
      });
    }
  }

  // CPI
  for (const d of CPI_DATES_2026) {
    const date = parse(d, 'yyyy-MM-dd', new Date());
    if (isAfter(date, now) && isBefore(date, cutoff)) {
      events.push({
        id: `cpi-${d}`,
        date: d,
        time: '08:30 ET',
        title: 'CPI Inflation Report',
        category: 'economic',
        impact: 'high',
        description: 'Consumer Price Index — key inflation gauge watched by the Fed and markets.',
        source: 'BLS',
      });
    }
  }

  // Jobs (NFP)
  for (const d of JOBS_DATES_2026) {
    const date = parse(d, 'yyyy-MM-dd', new Date());
    if (isAfter(date, now) && isBefore(date, cutoff)) {
      events.push({
        id: `nfp-${d}`,
        date: d,
        time: '08:30 ET',
        title: 'Non-Farm Payrolls',
        category: 'economic',
        impact: 'high',
        description: 'Monthly employment report. Strong/weak jobs data directly impacts Fed policy expectations.',
        source: 'BLS',
      });
    }
  }

  // PPI
  for (const d of PPI_DATES_2026) {
    const date = parse(d, 'yyyy-MM-dd', new Date());
    if (isAfter(date, now) && isBefore(date, cutoff)) {
      events.push({
        id: `ppi-${d}`,
        date: d,
        time: '08:30 ET',
        title: 'PPI Producer Prices',
        category: 'economic',
        impact: 'medium',
        description: 'Producer Price Index — upstream inflation signal.',
        source: 'BLS',
      });
    }
  }

  // Options expiry
  for (let m = 0; m < 12; m++) {
    const exp = getMonthlyOptionsExpiry(2026, m);
    if (!exp) continue;
    const date = parse(exp, 'yyyy-MM-dd', new Date());
    if (isAfter(date, now) && isBefore(date, cutoff)) {
      events.push({
        id: `opex-${exp}`,
        date: exp,
        title: 'Monthly Options Expiry (OPEX)',
        category: 'options',
        impact: 'medium',
        description: 'Third Friday options expiration. Often causes increased volatility and pinning near strikes.',
        source: 'CBOE',
      });
    }
  }

  // Earnings seasons
  for (const season of EARNINGS_SEASONS) {
    const start = parse(season.start, 'yyyy-MM-dd', new Date());
    if (isAfter(start, now) && isBefore(start, cutoff)) {
      events.push({
        id: `earnings-${season.name.replace(/\s+/g, '-').toLowerCase()}`,
        date: season.start,
        title: `${season.name} Begins`,
        category: 'earnings',
        impact: 'high',
        description: `Earnings season kicks off. Peak reporting around ${season.peak}. Watch for guidance revisions.`,
        source: 'Corporate Filings',
      });
    }
  }

  // Treasury auctions (roughly monthly)
  const treasuryDates = [
    '2026-05-06', '2026-05-13', '2026-05-20', '2026-05-27',
    '2026-06-03', '2026-06-10', '2026-06-17', '2026-06-24',
  ];
  for (const d of treasuryDates) {
    const date = parse(d, 'yyyy-MM-dd', new Date());
    if (isAfter(date, now) && isBefore(date, cutoff)) {
      events.push({
        id: `treasury-${d}`,
        date: d,
        time: '13:00 ET',
        title: 'Treasury Auction',
        category: 'economic',
        impact: 'low',
        description: 'US Treasury bond auction. Demand (bid-to-cover ratio) signals bond market appetite.',
        source: 'US Treasury',
      });
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

// ── Get Events for a Symbol ─────────────────────────────────────
export async function getSymbolEvents(symbol: string, days = 30): Promise<MacroEvent[]> {
  const all = await getUpcomingEvents(days);
  // Filter events that mention this symbol or are high-impact market-wide
  return all.filter(e =>
    e.impact === 'high' ||
    (e.symbols && e.symbols.includes(symbol))
  );
}
