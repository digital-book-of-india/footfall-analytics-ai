/**
 * Converts a local wall-clock date/time in an IANA timezone (e.g. "Asia/Kolkata") to the
 * UTC Date it represents, using only the built-in Intl API (no extra dependency). Used so
 * a shop's day boundaries and hourly buckets line up with its own local day, not UTC's.
 */
export function zonedTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const guessMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMs = getTimeZoneOffsetMs(guessMs, timeZone);
  return new Date(guessMs - offsetMs);
}

/** How far ahead of UTC `timeZone`'s wall clock reads at `utcMs` (e.g. +19800000 for IST). */
function getTimeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }

  const asUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return asUtcMs - utcMs;
}

/**
 * Floors `date` to the start of its containing hour in `timeZone`'s local calendar,
 * returned as the UTC instant of that local-hour boundary. Used so hourly aggregate
 * buckets land on the exact same grid the dashboard's per-hour chart buckets use
 * (`dayStart + h*3600000` in analytics.service.ts) - flooring to the UTC hour instead
 * would put buckets on a different grid for any non-whole-hour-offset zone (e.g.
 * Asia/Kolkata, UTC+5:30), silently splitting a single local hour across two buckets.
 */
export function floorToLocalHourUtc(date: Date, timeZone: string): Date {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
  });

  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }

  return zonedTimeToUtc(
    Number(parts.year),
    Number(parts.month),
    Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    0,
    0,
    zone
  );
}

/** Falls back to UTC for an invalid/unrecognised IANA zone rather than throwing. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}
