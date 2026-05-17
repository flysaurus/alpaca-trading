import { callLLM } from './ai/client';

export interface DipReason {
  reason:
    | 'EARNINGS_MISS'
    | 'MACRO'
    | 'GUIDANCE_CUT'
    | 'SECTOR_ROTATION'
    | 'COMPANY_SPECIFIC'
    | 'FRAUD_LEGAL'
    | 'UNKNOWN';
  recovery_probability: 'HIGH' | 'MEDIUM' | 'LOW';
  one_line_summary: string;
  red_flags: string[];
}

// Simple in-memory cache: symbol -> { timestamp, data }
const cache = new Map<string, { timestamp: number; data: DipReason }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function classifyDipReason(
  symbol: string,
  headlines: string[]
): Promise<DipReason> {
  const now = Date.now();
  const cached = cache.get(symbol);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const prompt = `
You are analyzing why ${symbol} dropped today.
Here are today's headlines:
${headlines.join('\n')}

Classify the drop reason as exactly one of:
- EARNINGS_MISS: Beat revenue but missed EPS or guidance cut
- MACRO: Broader market/sector selloff, not company-specific
- GUIDANCE_CUT: Company lowered forward guidance
- SECTOR_ROTATION: Money moving out of this sector
- COMPANY_SPECIFIC: Real problem with THIS company
- FRAUD_LEGAL: Fraud, SEC probe, major lawsuit
- UNKNOWN: Cannot determine from headlines

Then rate recovery probability:
- HIGH: Company is fundamentally strong, this is temporary
- MEDIUM: Uncertain, need more data
- LOW: Real structural problem

Respond in JSON only:
{
  "reason": "EARNINGS_MISS",
  "recovery_probability": "HIGH",
  "one_line_summary": "Missed EPS by 4% but revenue beat — macro headwinds, not company failure",
  "red_flags": [] // any serious concerns
}
`;

  const timeoutPromise = new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error('LLM timeout')), 30000)
  );

  let raw: string;
  try {
    raw = await Promise.race([callLLM(prompt), timeoutPromise]);
  } catch {
    // Timeout or LLM failure — return safe default, skip cache
    return {
      reason: 'UNKNOWN',
      recovery_probability: 'MEDIUM',
      one_line_summary: 'Classification timed out',
      red_flags: [],
    };
  }

  console.log('Raw LLM response for', symbol, ':', raw);

  let parsed: DipReason;
  try {
    // Try direct parse first
    parsed = JSON.parse(raw) as DipReason;
  } catch {
    // Try extracting JSON from response
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]) as DipReason;
      } catch {
        // Return safe default
        parsed = {
          reason: 'UNKNOWN',
          recovery_probability: 'MEDIUM',
          one_line_summary: 'Analysis unavailable',
          red_flags: [],
        };
      }
    } else {
      // Return safe default
      parsed = {
        reason: 'UNKNOWN',
        recovery_probability: 'MEDIUM',
        one_line_summary: 'Analysis unavailable',
        red_flags: [],
      };
    }
  }

  cache.set(symbol, { timestamp: now, data: parsed });
  return parsed;
}

export function isDipSafe(reason: DipReason): boolean {
  // Never recommend on these
  if (reason.reason === 'FRAUD_LEGAL') return false;
  if (
    reason.reason === 'COMPANY_SPECIFIC' &&
    reason.recovery_probability === 'LOW'
  )
    return false;
  return true;
}
