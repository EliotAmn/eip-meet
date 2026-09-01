import { DateTime } from 'luxon';

// All availability is stored as absolute UTC instants (ISO strings).
// A poll's dayStart/dayEnd window is interpreted in the *viewer's* local
// timezone, so the same grid (e.g. 7h-20h) is drawn in everyone's own local
// time, while overlaps are computed on the underlying absolute instants.

/** Inclusive list of calendar dates (YYYY-MM-DD) between two dates. */
export function enumerateDates(dateMin: string, dateMax: string): string[] {
  const out: string[] = [];
  let d = DateTime.fromISO(dateMin);
  const end = DateTime.fromISO(dateMax);
  // Guard against a runaway loop on bad input.
  let guard = 0;
  while (d <= end && guard < 3660) {
    out.push(d.toFormat('yyyy-MM-dd'));
    d = d.plus({ days: 1 });
    guard += 1;
  }
  return out;
}

/** Number of time rows in the day window for a given granularity. */
export function rowCount(dayStart: number, dayEnd: number, granularity: number): number {
  return Math.max(0, Math.round(((dayEnd - dayStart) * 60) / granularity));
}

/** Row labels ("07:00", "07:30", ...) for the visible day window. */
export function rowLabels(dayStart: number, dayEnd: number, granularity: number): string[] {
  const labels: string[] = [];
  const n = rowCount(dayStart, dayEnd, granularity);
  for (let i = 0; i < n; i += 1) {
    const minutes = dayStart * 60 + i * granularity;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    labels.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
  return labels;
}

/**
 * UTC ISO instant for a given (calendar date, row index) cell, interpreted in
 * the viewer's timezone. This is the canonical slot key stored in the DB.
 */
export function cellToUtc(
  dateISO: string,
  rowIndex: number,
  dayStart: number,
  granularity: number,
  tz: string,
): string {
  const minutes = dayStart * 60 + rowIndex * granularity;
  const local = DateTime.fromISO(dateISO, { zone: tz }).plus({ minutes });
  return local.toUTC().toISO({ suppressMilliseconds: true })!;
}

/** Human label for a UTC instant rendered in a timezone, e.g. "lun. 3 mars 09:00". */
export function formatInstant(utcISO: string, tz: string, locale = 'fr'): string {
  return DateTime.fromISO(utcISO, { zone: 'utc' })
    .setZone(tz)
    .setLocale(locale)
    .toFormat("ccc d LLL HH:mm");
}

/** Short time-only label for a UTC instant in a timezone, e.g. "09:00". */
export function formatTime(utcISO: string, tz: string): string {
  return DateTime.fromISO(utcISO, { zone: 'utc' }).setZone(tz).toFormat('HH:mm');
}

/** Full day + range label, e.g. "lun. 3 mars, 09:00 - 10:30". */
export function formatRange(startUtc: string, endUtc: string, tz: string, locale = 'fr'): string {
  const start = DateTime.fromISO(startUtc, { zone: 'utc' }).setZone(tz).setLocale(locale);
  const end = DateTime.fromISO(endUtc, { zone: 'utc' }).setZone(tz).setLocale(locale);
  const sameDay = start.hasSame(end, 'day');
  const startLabel = start.toFormat('cccc d LLLL, HH:mm');
  const endLabel = sameDay ? end.toFormat('HH:mm') : end.toFormat('cccc d LLLL, HH:mm');
  return `${startLabel} - ${endLabel}`;
}

/** Add minutes to a UTC ISO instant, returning a UTC ISO instant. */
export function addMinutes(utcISO: string, minutes: number): string {
  return DateTime.fromISO(utcISO, { zone: 'utc' })
    .plus({ minutes })
    .toISO({ suppressMilliseconds: true })!;
}

/** The viewer's detected IANA timezone, falling back to UTC. */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Current UTC offset label for a timezone, e.g. "UTC+01:00". */
export function offsetLabel(tz: string): string {
  const now = DateTime.now().setZone(tz);
  const offset = now.toFormat('ZZ');
  return `UTC${offset}`;
}
