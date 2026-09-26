import { DateTime } from 'luxon';
import type { Interval, UnavailabilityDTO, UnavailabilityType } from './types';

// Unavailabilities are stored as wall-clock time in their own timezone, plus a
// simple recurrence rule and per-date exceptions. This module turns them into
// concrete occurrences (absolute instants) for a given range.

export interface Occurrence {
  eventId: string;
  date: string; // original occurrence date (YYYY-MM-DD, event timezone)
  startUtc: string;
  endUtc: string;
  allDay: boolean;
  startDate: string; // local first day (all-day)
  endDateExclusive: string; // local day after the last day (all-day)
  title: string | null;
  type: UnavailabilityType;
  recurring: boolean;
  modified: boolean;
}

/** Apply "HH:mm" (or "24:00") as wall-clock time on a local day. DST-safe. */
export function atWallTime(day: DateTime, time: string): DateTime {
  const [h, m] = time.split(':').map(Number);
  if (h >= 24) return day.plus({ days: 1 }).startOf('day');
  return day.set({ hour: h, minute: m, second: 0, millisecond: 0 });
}

function occursOn(
  ev: UnavailabilityDTO,
  first: DateTime,
  day: DateTime,
  weekdays: number[],
): boolean {
  const interval = Math.max(1, ev.interval);
  switch (ev.freq) {
    case 'none':
      return day.toISODate() === first.toISODate();
    case 'daily':
      return Math.round(day.diff(first, 'days').days) % interval === 0;
    case 'weekly': {
      if (!weekdays.includes(day.weekday)) return false;
      const weeks = Math.round(day.startOf('week').diff(first.startOf('week'), 'weeks').weeks);
      return weeks % interval === 0;
    }
    case 'monthly': {
      if (day.day !== first.day) return false;
      const months = (day.year - first.year) * 12 + (day.month - first.month);
      return months % interval === 0;
    }
    default:
      return false;
  }
}

/** Occurrences of `ev` overlapping [from, to). */
export function expandOccurrences(
  ev: UnavailabilityDTO,
  from: DateTime,
  to: DateTime,
): Occurrence[] {
  const zone = ev.timezone;
  const first = DateTime.fromISO(ev.startDate, { zone }).startOf('day');
  if (!first.isValid) return [];
  const spanDays = ev.allDay
    ? Math.max(0, Math.round(DateTime.fromISO(ev.endDate, { zone }).diff(first, 'days').days))
    : 0;
  const until = ev.until ? DateTime.fromISO(ev.until, { zone }).startOf('day') : null;
  const weekdays = ev.byWeekday.length > 0 ? ev.byWeekday : [first.weekday];
  const exceptions = new Map(ev.exceptions.map((e) => [e.date, e]));

  // Scan local days; start early enough to catch multi-day events that began
  // before the range.
  let day = from.setZone(zone).startOf('day').minus({ days: spanDays + 1 });
  if (day < first) day = first;
  const lastDay = to.setZone(zone).startOf('day').plus({ days: 1 });

  const out: Occurrence[] = [];
  for (let guard = 0; day <= lastDay && guard < 5000; guard += 1, day = day.plus({ days: 1 })) {
    if (until && day > until) break;
    if (!occursOn(ev, first, day, weekdays)) continue;
    const date = day.toISODate()!;
    const ex = exceptions.get(date);
    if (ex?.cancelled) continue;

    let start: DateTime;
    let end: DateTime;
    if (ev.allDay) {
      start = day;
      end = day.plus({ days: spanDays + 1 });
    } else {
      start = atWallTime(day, ex?.startTime ?? ev.startTime ?? '00:00');
      end = atWallTime(day, ex?.endTime ?? ev.endTime ?? '24:00');
    }
    if (end <= from || start >= to) continue;

    out.push({
      eventId: ev.id,
      date,
      startUtc: start.toUTC().toISO({ suppressMilliseconds: true })!,
      endUtc: end.toUTC().toISO({ suppressMilliseconds: true })!,
      allDay: ev.allDay,
      startDate: date,
      endDateExclusive: day.plus({ days: spanDays + 1 }).toISODate()!,
      title: ex?.title ?? ev.title,
      type: ex?.type ?? ev.type,
      recurring: ev.freq !== 'none',
      modified: !!ex,
    });
  }
  return out;
}

/** Merge overlapping/adjacent [start, end) intervals (ISO UTC strings). */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list
    .map(([s, e]) => [Date.parse(s), Date.parse(e)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out.map(([s, e]) => [new Date(s).toISOString(), new Date(e).toISOString()]);
}

/** Busy / soft intervals of a set of unavailabilities over [from, to). */
export function unavailabilityIntervals(
  events: UnavailabilityDTO[],
  from: DateTime,
  to: DateTime,
): { busy: Interval[]; soft: Interval[] } {
  const busy: Interval[] = [];
  const soft: Interval[] = [];
  for (const ev of events) {
    for (const occ of expandOccurrences(ev, from, to)) {
      (occ.type === 'busy' ? busy : soft).push([occ.startUtc, occ.endUtc]);
    }
  }
  return { busy: mergeIntervals(busy), soft: mergeIntervals(soft) };
}
