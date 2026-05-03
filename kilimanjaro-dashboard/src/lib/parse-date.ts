export function parseDate(val: unknown): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (!s) return null;

  // Apple Health / HAE format FIRST (most common): "2026-05-02 15:52:38 -0400"
  // MUST match before native parsing because "2026-05-02 15:52:38 -0400" is NOT valid ISO-8601
  const haeMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.\d{3})?\s+([+-]\d{4})$/);
  if (haeMatch) {
    const tz = haeMatch[7];                       // e.g. "-0400"
    const tzHours = parseInt(tz.slice(0, 3), 10);   // e.g. -4
    const tzMinutes = parseInt(tz[0] + tz.slice(3, 5), 10); // e.g. 0
    const offsetMs = (tzHours * 60 + tzMinutes) * 60 * 1000;

    const localMs = Date.UTC(
      parseInt(haeMatch[1], 10),
      parseInt(haeMatch[2], 10) - 1,
      parseInt(haeMatch[3], 10),
      parseInt(haeMatch[4], 10),
      parseInt(haeMatch[5], 10),
      parseInt(haeMatch[6], 10)
    );

    const result = new Date(localMs - offsetMs);
    if (!isNaN(result.getTime())) {
      return result.toISOString();
    }
  }

  // ISO 8601 with numeric timezone offset: "2026-05-02T15:52:38-04:00" or "2026-05-02T15:52:38+05:30"
  const isoTzMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?([+-]\d{2}:\d{2})$/);
  if (isoTzMatch) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // Plain ISO 8601 UTC: "2026-05-02T15:52:38Z" or "2026-05-02T15:52:38.123Z"
  const plainIsoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/);
  if (plainIsoMatch) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // RFC 2822 / other formats as last resort
  const d0 = new Date(s);
  if (!isNaN(d0.getTime())) {
    return d0.toISOString();
  }

  return null;
}
