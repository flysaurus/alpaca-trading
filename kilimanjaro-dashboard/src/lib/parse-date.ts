export function parseDate(val: unknown): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (!s) return null;

  // Try native parsing first for ISO formats
  const d0 = new Date(s);
  if (!isNaN(d0.getTime())) {
    return d0.toISOString();
  }

  // Apple Health / HAE format: "2026-05-02 15:52:38 -0400"
  const haeMatch = s.match(/^\d{4}-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.\d{3})?\s+([+-]\d{4})$/);
  if (haeMatch) {
    const tz = haeMatch[6];              // e.g. "-0400"
    const tzHours = parseInt(tz.slice(0, 3), 10);  // e.g. -4
    const tzMinutes = parseInt(tz[0] + tz.slice(3, 5), 10); // e.g. 0
    const offsetMs = (tzHours * 60 + tzMinutes) * 60 * 1000;

    const localMs = Date.UTC(
      parseInt(haeMatch[0].slice(0, 4), 10), // year from full match
      parseInt(haeMatch[1], 10) - 1,           // month
      parseInt(haeMatch[2], 10),             // day
      parseInt(haeMatch[3], 10),             // hour
      parseInt(haeMatch[4], 10),             // minute
      parseInt(haeMatch[5], 10)              // second
    );

    const result = new Date(localMs - offsetMs);
    if (!isNaN(result.getTime())) {
      return result.toISOString();
    }
  }

  // ISO with timezone: "2026-05-02T15:52:38-04:00"
  const isoTzMatch = s.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}:\d{2}$/);
  if (isoTzMatch) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  return null;
}
