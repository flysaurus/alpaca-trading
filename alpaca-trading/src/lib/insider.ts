// ── Types ───────────────────────────────────────────────────────
export interface InsiderTransaction {
  id: string;
  symbol: string;
  companyName: string;
  insiderName: string;
  insiderTitle: string;
  transactionType: 'purchase' | 'sale' | 'grant' | 'other';
  shares: number;
  pricePerShare: number;
  totalValue: number;
  transactionDate: string;
  filingDate: string;
  ownershipType: 'direct' | 'indirect';
  form4Url?: string;
}

// ── SEC EDGAR Full-Text Search ──────────────────────────────────
// https://efts.sec.gov/LATEST/search-index
const SEC_SEARCH_URL = 'https://efts.sec.gov/LATEST/search-index';

interface SecFilingHit {
  _source: {
    ciks: string[];
    display_names: string[];
    file_date: string;
    form: string;
    period_ending?: string;
    adsh?: string;
    root_form?: string;
  };
}

/**
 * Search SEC EDGAR for recent Form 4 filings
 */
export async function searchForm4Filings(
  symbol?: string,
  daysBack = 30,
  maxResults = 50
): Promise<InsiderTransaction[]> {
  const fromDate = new Date(Date.now() - daysBack * 86400 * 1000)
    .toISOString()
    .split('T')[0]
    .replace(/-/g, '');

  const mustClauses: any[] = [
    { match: { form: '4' } },
    {
      range: {
        file_date: { gte: fromDate },
      },
    },
  ];

  // If symbol provided, add ticker filter via entity name
  if (symbol) {
    mustClauses.push({ match: { display_names: symbol } });
  }

  const query = {
    query: {
      bool: {
        must: mustClauses,
      },
    },
    sort: [{ file_date: { order: 'desc' } }],
    size: maxResults,
    _source: ['ciks', 'display_names', 'file_date', 'form', 'period_ending', 'adsh', 'root_form'],
  };

  try {
    const res = await fetch(SEC_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    });

    if (!res.ok) {
      console.warn('[SEC EDGAR] Search failed:', res.status);
      return [];
    }

    const json = await res.json();
    const hits: SecFilingHit[] = json.hits?.hits || [];

    return hits.map((hit) => {
      const src = hit._source;
      const companyName = src.display_names?.[0] || 'Unknown';
      const filingDate = src.file_date
        ? `${src.file_date.slice(0, 4)}-${src.file_date.slice(4, 6)}-${src.file_date.slice(6, 8)}`
        : '';

      return {
        id: `${src.adsh || src.ciks?.[0]}-${filingDate}`,
        symbol: symbol || extractSymbolFromName(companyName),
        companyName,
        insiderName: 'See Form 4',
        insiderTitle: 'N/A',
        transactionType: 'other',
        shares: 0,
        pricePerShare: 0,
        totalValue: 0,
        transactionDate: filingDate,
        filingDate,
        ownershipType: 'direct',
        form4Url: src.adsh
          ? `https://www.sec.gov/Archives/edgar/data/${src.ciks?.[0]}/${src.adsh}.txt`
          : undefined,
      };
    });
  } catch (err) {
    console.warn('[SEC EDGAR] Error:', err);
    return [];
  }
}

function extractSymbolFromName(name: string): string {
  // Common pattern: "APPLE INC" → AAPL (we can't reliably extract this without a mapping)
  // Return uppercase first word as best guess
  const words = name.split(/\s+/);
  const first = words[0]?.toUpperCase() || 'UNKNOWN';
  if (first.length <= 5) return first;
  return 'UNKNOWN';
}

// ── Alternative: SEC RSS Feed for Form 4 ────────────────────────
const SEC_RSS_URL = 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&company=&dateb=&owner=only&start=0&count=100&output=atom';

/**
 * Parse SEC Atom feed for recent Form 4 filings
 * More reliable than full-text search for recent filings
 */
export async function getRecentForm4Rss(maxResults = 50): Promise<InsiderTransaction[]> {
  try {
    const res = await fetch(SEC_RSS_URL, {
      headers: {
        'User-Agent': 'AlpacaTradingBot/1.0 (contact@example.com)',
      },
    });

    if (!res.ok) {
      console.warn('[SEC RSS] Failed:', res.status);
      return [];
    }

    const xml = await res.text();
    return parseForm4Atom(xml, maxResults);
  } catch (err) {
    console.warn('[SEC RSS] Error:', err);
    return [];
  }
}

function parseForm4Atom(xml: string, maxResults: number): InsiderTransaction[] {
  const entries: InsiderTransaction[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null && entries.length < maxResults) {
    const entry = match[1];
    const titleMatch = entry.match(/<title>(.*?)<\/title>/);
    const updatedMatch = entry.match(/<updated>(.*?)<\/updated>/);
    const linkMatch = entry.match(/<link\s+href="(.*?)"/);

    if (titleMatch && updatedMatch) {
      const title = titleMatch[1];
      const updated = updatedMatch[1];
      const link = linkMatch?.[1] || '';

      // Parse title: "4 - SMITH JOHN (CEO) (APPLE INC)"
      const parsed = parseForm4Title(title);

      entries.push({
        id: `${parsed.symbol}-${updated}`,
        symbol: parsed.symbol,
        companyName: parsed.company,
        insiderName: parsed.insider,
        insiderTitle: parsed.title,
        transactionType: 'other',
        shares: 0,
        pricePerShare: 0,
        totalValue: 0,
        transactionDate: updated.split('T')[0],
        filingDate: updated.split('T')[0],
        ownershipType: 'direct',
        form4Url: link,
      });
    }
  }

  return entries;
}

function parseForm4Title(title: string): { symbol: string; company: string; insider: string; title: string } {
  // Title format: "4 - DOE JOHN (CEO) (APPLE INC)"
  const parts = title.split(' - ');
  if (parts.length < 2) {
    return { symbol: 'UNKNOWN', company: 'Unknown', insider: title, title: 'N/A' };
  }

  const rest = parts[1];
  const parenMatch = rest.match(/\(([^)]+)\)/g);

  let insider = rest;
  let insiderTitle = 'N/A';
  let company = 'Unknown';

  if (parenMatch) {
    // Last paren is usually company name, second-to-last is title
    company = parenMatch[parenMatch.length - 1]?.replace(/[()]/g, '').trim() || 'Unknown';
    if (parenMatch.length > 1) {
      insiderTitle = parenMatch[parenMatch.length - 2]?.replace(/[()]/g, '').trim() || 'N/A';
    }
    insider = rest.replace(/\([^)]+\)/g, '').trim();
  }

  return {
    symbol: extractSymbolFromName(company),
    company,
    insider,
    title: insiderTitle,
  };
}

// ── Aggregate Insider Activity ──────────────────────────────────
export async function getInsiderActivity(
  symbol?: string,
  daysBack = 30
): Promise<{ purchases: number; sales: number; totalValue: number; transactions: InsiderTransaction[] }> {
  const filings = symbol
    ? await searchForm4Filings(symbol, daysBack, 100)
    : await getRecentForm4Rss(100);

  let purchases = 0;
  let sales = 0;
  let totalValue = 0;

  for (const t of filings) {
    if (t.transactionType === 'purchase') purchases++;
    else if (t.transactionType === 'sale') sales++;
    totalValue += t.totalValue;
  }

  return { purchases, sales, totalValue, transactions: filings };
}
