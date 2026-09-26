import { createHash } from 'node:crypto';
import ICAL from 'ical.js';
import { DateTime } from 'luxon';
import type { Freq, UnavailabilityInput, UnavailabilityType } from './types';
import { isValidTimezone, validateUnavailability, ValidationError } from './validate';

// One-shot .ics import. Every VEVENT becomes one or more unavailabilities with
// a stable key (UID, plus the occurrence / day when an event has to be split),
// so re-importing an updated file only touches what changed.
//
// Our model has simple rules (daily / weekly / monthly, timed events within one
// day). Anything richer (yearly, "2nd Tuesday", overnight recurring events,
// RDATE...) is expanded into single occurrences over the next year.

type IcalTime = InstanceType<typeof ICAL.Time>;
type IcalComponent = InstanceType<typeof ICAL.Component>;
type IcalRecur = InstanceType<typeof ICAL.Recur>;

export interface IcsException {
  date: string;
  cancelled: boolean;
  title: string | null;
  type: UnavailabilityType | null;
  startTime: string | null;
  endTime: string | null;
}

export interface IcsItem {
  key: string;
  input: UnavailabilityInput;
  exceptions: IcsException[];
  /** Hash of what the file says (input + exceptions). */
  hash: string;
}

export interface IcsIgnored {
  past: number;
  free: number;
  cancelled: number;
  duplicates: number;
  invalid: number;
  overflow: number;
}

export interface ParsedIcs {
  calendarName: string | null;
  items: IcsItem[];
  ignored: IcsIgnored;
}

const MAX_ITEMS = 3000;
const EXPAND_MONTHS = 12;
const WEEKDAYS: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };

interface Ctx {
  userTz: string;
  today: string;
  horizon: number;
  items: IcsItem[];
  seenKeys: Set<string>;
  seenHashes: Set<string>;
  ignored: IcsIgnored;
}

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');

// ---------- Time helpers ----------

/** IANA zone of a date-time, when its TZID is one. */
function ianaZone(t: IcalTime): string | null {
  if (t.zone?.tzid === 'UTC') return 'UTC';
  const raw = (t as unknown as { timezone?: string }).timezone ?? t.zone?.tzid;
  if (!raw || raw === 'floating') return null;
  const id = raw.replace(/^\/+/, '');
  return isValidTimezone(id) ? id : null;
}

/** Absolute instant (ms) of a date-time. Floating times are the user's. */
function instant(t: IcalTime, userTz: string): number {
  const f = { year: t.year, month: t.month, day: t.day, hour: t.hour, minute: t.minute, second: t.second };
  const utc = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
  if (t.zone?.tzid === 'UTC') return utc;
  const iana = ianaZone(t);
  if (iana) return DateTime.fromObject(f, { zone: iana }).toMillis();
  // Non-IANA TZID (e.g. Outlook's "Romance Standard Time"): its VTIMEZONE.
  if (t.zone && t.zone !== ICAL.Timezone.localTimezone && t.zone.tzid !== 'floating') {
    return utc - t.zone.utcOffset(t) * 1000;
  }
  return DateTime.fromObject(f, { zone: userTz }).toMillis();
}

/** A date or date-time as a local DateTime in `zone`. */
function local(t: IcalTime, zone: string, userTz: string): DateTime {
  if (t.isDate) return DateTime.fromObject({ year: t.year, month: t.month, day: t.day }, { zone });
  return DateTime.fromMillis(instant(t, userTz), { zone });
}

/** "HH:mm", rounded up to the minute; the next midnight is "24:00". */
function endClock(e: DateTime, dayStart: DateTime): string {
  const m = e.second || e.millisecond ? e.startOf('minute').plus({ minutes: 1 }) : e;
  return m >= dayStart.plus({ days: 1 }) ? '24:00' : m.toFormat('HH:mm');
}

// ---------- Components ----------

type Kind = UnavailabilityType | 'free' | 'cancelled';

function kindOf(c: IcalComponent): Kind {
  const status = String(c.getFirstPropertyValue('status') ?? '').toUpperCase();
  if (status === 'CANCELLED') return 'cancelled';
  if (String(c.getFirstPropertyValue('transp') ?? '').toUpperCase() === 'TRANSPARENT') return 'free';
  return status === 'TENTATIVE' ? 'soft' : 'busy';
}

function titleOf(c: IcalComponent): string | null {
  const t = String(c.getFirstPropertyValue('summary') ?? '').trim();
  return t ? t.slice(0, 100) : null;
}

/** Start and end of a VEVENT (end defaults per RFC 5545). */
function span(c: IcalComponent): { start: IcalTime; end: IcalTime } | null {
  const ev = new ICAL.Event(c);
  const start = ev.startDate;
  if (!start) return null;
  if (c.hasProperty('dtend') || c.hasProperty('duration')) return { start, end: ev.endDate };
  if (!start.isDate) return null; // zero-length reminder
  const end = start.clone();
  end.day += 1;
  return { start, end };
}

// ---------- Items ----------

function addItem(ctx: Ctx, key: string, raw: Record<string, unknown>, exceptions: IcsException[] = []) {
  let input: UnavailabilityInput;
  try {
    input = validateUnavailability(raw);
  } catch {
    ctx.ignored.invalid += 1;
    return;
  }
  const sorted = [...exceptions].sort((a, b) => a.date.localeCompare(b.date));
  const hash = sha1(JSON.stringify({ input, exceptions: sorted }));
  if (ctx.seenKeys.has(key) || ctx.seenHashes.has(hash)) {
    ctx.ignored.duplicates += 1;
    return;
  }
  if (ctx.items.length >= MAX_ITEMS) {
    ctx.ignored.overflow += 1;
    return;
  }
  ctx.seenKeys.add(key);
  ctx.seenHashes.add(hash);
  ctx.items.push({ key, input, exceptions: sorted, hash });
}

/** A single (non-recurring) event, split per day when timed and overnight. */
function addSingle(
  ctx: Ctx,
  key: string,
  title: string | null,
  type: UnavailabilityType,
  start: IcalTime,
  end: IcalTime,
  countPast = true,
) {
  const tz = ctx.userTz;
  const past = () => {
    if (countPast) ctx.ignored.past += 1;
  };
  if (start.isDate) {
    const s = local(start, tz, tz);
    const eExcl = local(end, tz, tz).startOf('day');
    const last = eExcl > s ? eExcl.minus({ days: 1 }) : s;
    if (last.toISODate()! < ctx.today) {
      past();
      return;
    }
    addItem(ctx, key, {
      title,
      type,
      allDay: true,
      startDate: s.toISODate(),
      endDate: last.toISODate(),
      timezone: tz,
      freq: 'none',
    });
    return;
  }
  const s = local(start, tz, tz);
  const e = local(end, tz, tz);
  if (e <= s) {
    ctx.ignored.invalid += 1;
    return;
  }
  const parts: { date: string; startTime: string; endTime: string }[] = [];
  for (let d = s.startOf('day'); d < e && parts.length < 60; d = d.plus({ days: 1 })) {
    const ps = s > d ? s : d;
    const pe = e < d.plus({ days: 1 }) ? e : d.plus({ days: 1 });
    const startTime = ps.toFormat('HH:mm');
    const endTime = endClock(pe, d);
    if (endTime !== '24:00' && endTime <= startTime) continue;
    parts.push({ date: d.toISODate()!, startTime, endTime });
  }
  const future = parts.filter((p) => p.date >= ctx.today);
  if (future.length === 0) {
    past();
    return;
  }
  for (const p of future) {
    addItem(ctx, parts.length === 1 ? key : `${key}#${p.date}`, {
      title,
      type,
      allDay: false,
      startDate: p.date,
      endDate: p.date,
      startTime: p.startTime,
      endTime: p.endTime,
      timezone: tz,
      freq: 'none',
    });
  }
}

/** Our rule for an RRULE, or null when it needs expanding. */
function mapRule(
  rule: IcalRecur,
  first: DateTime,
): { freq: Freq; interval: number; byWeekday: number[] } | null {
  const parts = rule.parts as Record<string, (string | number)[] | undefined>;
  const allowed = new Set(['BYDAY', 'BYMONTHDAY', 'WKST']);
  if (Object.keys(parts).some((k) => !allowed.has(k) && (parts[k]?.length ?? 0) > 0)) return null;
  const interval = rule.interval || 1;
  if (interval > 99) return null;
  const byDay = parts.BYDAY?.map(String) ?? [];
  if (byDay.some((d) => !(d in WEEKDAYS))) return null; // "2TU", "-1FR"...
  const days = byDay.map((d) => WEEKDAYS[d]);
  const monthDays = parts.BYMONTHDAY?.map(Number) ?? [];
  switch (rule.freq) {
    case 'DAILY':
      if (monthDays.length) return null;
      if (days.length) return interval === 1 ? { freq: 'weekly', interval: 1, byWeekday: days } : null;
      return { freq: 'daily', interval, byWeekday: [] };
    case 'WEEKLY':
      if (monthDays.length) return null;
      return { freq: 'weekly', interval, byWeekday: days.length ? days : [first.weekday] };
    case 'MONTHLY':
      if (days.length || monthDays.some((d) => d !== first.day)) return null;
      return { freq: 'monthly', interval, byWeekday: [] };
    default:
      return null;
  }
}

function addRecurring(
  ctx: Ctx,
  uid: string,
  master: IcalComponent,
  overrides: IcalComponent[],
  kind: UnavailabilityType,
) {
  const title = titleOf(master);
  const sp = span(master);
  if (!sp) {
    ctx.ignored.invalid += 1;
    return;
  }
  const rule = master.getFirstPropertyValue('rrule') as IcalRecur;
  const tz = sp.start.isDate ? ctx.userTz : ianaZone(sp.start) ?? ctx.userTz;
  const s = local(sp.start, tz, ctx.userTz);
  const e = local(sp.end, tz, ctx.userTz);
  const allDay = sp.start.isDate;
  const dayEnd = s.startOf('day').plus({ days: 1 });
  const mapped =
    master.hasProperty('rdate') || (!allDay && e > dayEnd) || e <= s ? null : mapRule(rule, s);
  if (!mapped) {
    expand(ctx, uid, master, overrides);
    return;
  }

  let until: string | null = null;
  if (rule.until) {
    until = local(rule.until, tz, ctx.userTz).toISODate();
  } else if (rule.count) {
    const it = rule.iterator(sp.start);
    let last: IcalTime | null = null;
    for (let i = 0, n = it.next(); n && i < rule.count; i += 1, n = it.next()) last = n;
    until = last ? local(last, tz, ctx.userTz).toISODate() : s.toISODate();
  }
  if (until && until < ctx.today) {
    ctx.ignored.past += 1;
    return;
  }

  const exceptions = new Map<string, IcsException>();
  const cancel = (date: string) =>
    exceptions.set(date, { date, cancelled: true, title: null, type: null, startTime: null, endTime: null });
  for (const p of master.getAllProperties('exdate')) {
    for (const v of p.getValues() as IcalTime[]) cancel(local(v, tz, ctx.userTz).toISODate()!);
  }
  for (const o of overrides) {
    const rid = o.getFirstPropertyValue('recurrence-id') as IcalTime;
    const date = local(rid, tz, ctx.userTz).toISODate()!;
    const k = kindOf(o);
    const osp = span(o);
    if (k === 'free' || k === 'cancelled' || !osp) {
      cancel(date);
      continue;
    }
    const os = local(osp.start, tz, ctx.userTz);
    const oe = local(osp.end, tz, ctx.userTz);
    const sameDay =
      !allDay && !osp.start.isDate && os.toISODate() === date && oe > os && oe <= os.startOf('day').plus({ days: 1 });
    if (sameDay) {
      const oTitle = titleOf(o);
      exceptions.set(date, {
        date,
        cancelled: false,
        title: oTitle !== title ? oTitle : null,
        type: k !== kind ? k : null,
        startTime: os.toFormat('HH:mm'),
        endTime: endClock(oe, os.startOf('day')),
      });
    } else {
      // Moved to another day (or all-day): drop it here, add it on its own.
      cancel(date);
      addSingle(ctx, `${uid}@${rid.toString()}`, titleOf(o), k, osp.start, osp.end);
    }
  }

  addItem(
    ctx,
    uid,
    {
      title,
      type: kind,
      allDay,
      startDate: s.toISODate(),
      endDate: allDay && e.minus({ days: 1 }) > s ? e.minus({ days: 1 }).toISODate() : s.toISODate(),
      startTime: allDay ? null : s.toFormat('HH:mm'),
      endTime: allDay ? null : endClock(e, s.startOf('day')),
      timezone: tz,
      freq: mapped.freq,
      interval: mapped.interval,
      byWeekday: mapped.byWeekday,
      until,
    },
    [...exceptions.values()],
  );
}

/** Rules we cannot store: one item per occurrence over the next months. */
function expand(ctx: Ctx, uid: string, master: IcalComponent, overrides: IcalComponent[]) {
  const ev = new ICAL.Event(master);
  for (const o of overrides) ev.relateException(o);
  const it = ev.iterator();
  const before = ctx.items.length;
  for (let guard = 0, n = it.next(); n && guard < 20000; guard += 1, n = it.next()) {
    const det = ev.getOccurrenceDetails(n);
    const start = det.startDate.isDate
      ? local(det.startDate, ctx.userTz, ctx.userTz).toMillis()
      : instant(det.startDate, ctx.userTz);
    if (start > ctx.horizon) break;
    const c = det.item.component;
    const k = kindOf(c);
    if (k === 'free' || k === 'cancelled') continue;
    addSingle(ctx, `${uid}@${n.toString()}`, titleOf(c), k, det.startDate, det.endDate, false);
  }
  if (ctx.items.length === before) ctx.ignored.past += 1;
}

// ---------- Entry point ----------

export function parseIcs(text: string, userTz: string, now = DateTime.now()): ParsedIcs {
  let cal: IcalComponent;
  try {
    const jcal = ICAL.parse(text);
    cal = new ICAL.Component(Array.isArray(jcal[0]) ? jcal[0] : jcal);
  } catch {
    throw new ValidationError("Ce fichier n'est pas un calendrier .ics valide.");
  }
  if (cal.name !== 'vcalendar') {
    throw new ValidationError("Ce fichier n'est pas un calendrier .ics valide.");
  }

  const nowLocal = now.setZone(userTz);
  const ctx: Ctx = {
    userTz,
    today: nowLocal.toISODate()!,
    horizon: nowLocal.plus({ months: EXPAND_MONTHS }).toMillis(),
    items: [],
    seenKeys: new Set(),
    seenHashes: new Set(),
    ignored: { past: 0, free: 0, cancelled: 0, duplicates: 0, invalid: 0, overflow: 0 },
  };

  // Group by UID: the master (latest SEQUENCE wins) and its modified occurrences.
  const byUid = new Map<string, { master: IcalComponent | null; overrides: IcalComponent[] }>();
  for (const c of cal.getAllSubcomponents('vevent')) {
    const uid = String(c.getFirstPropertyValue('uid') ?? '').trim() || `nouid:${sha1(c.toString()).slice(0, 16)}`;
    const entry = byUid.get(uid) ?? { master: null, overrides: [] };
    byUid.set(uid, entry);
    if (c.hasProperty('recurrence-id')) {
      entry.overrides.push(c);
      continue;
    }
    const seq = (x: IcalComponent) => Number(x.getFirstPropertyValue('sequence') ?? 0);
    if (!entry.master || seq(c) >= seq(entry.master)) entry.master = c;
  }

  for (const [uid, { master, overrides }] of byUid) {
    if (!master) {
      // Only modified occurrences (e.g. invited to a single instance).
      for (const o of overrides) {
        const k = kindOf(o);
        const sp = span(o);
        if (k === 'free') ctx.ignored.free += 1;
        else if (k === 'cancelled') ctx.ignored.cancelled += 1;
        else if (!sp) ctx.ignored.invalid += 1;
        else {
          const rid = o.getFirstPropertyValue('recurrence-id') as IcalTime;
          addSingle(ctx, `${uid}@${rid.toString()}`, titleOf(o), k, sp.start, sp.end);
        }
      }
      continue;
    }
    const k = kindOf(master);
    if (k === 'free') {
      ctx.ignored.free += 1;
      continue;
    }
    if (k === 'cancelled') {
      ctx.ignored.cancelled += 1;
      continue;
    }
    if (master.hasProperty('rrule')) {
      addRecurring(ctx, uid, master, overrides, k);
      continue;
    }
    const sp = span(master);
    if (!sp) ctx.ignored.invalid += 1;
    else addSingle(ctx, uid, titleOf(master), k, sp.start, sp.end);
  }

  const name = String(cal.getFirstPropertyValue('x-wr-calname') ?? '').trim();
  return { calendarName: name ? name.slice(0, 200) : null, items: ctx.items, ignored: ctx.ignored };
}
