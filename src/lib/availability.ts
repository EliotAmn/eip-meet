import { DateTime } from 'luxon';
import type { Interval, MeetingConfig, MeetingDetail } from './types';
import { enumerateDates } from './time';
import { fromIso, type MsInterval } from './intervals';

// Minute-precision availability engine.
// For every meeting day (in the viewer's timezone, within the visible hour
// window) we build, per participant, a minute-by-minute status (0 = not
// available, 1 = "si besoin", 2 = available), then derive for every start
// minute whether they can attend the WHOLE meeting (duration) from there.

const MIN = 60_000;

export interface GridParticipant {
  id: string; // "m:<memberId>" or "g:<guestId>"
  name: string;
  kind: 'member' | 'guest';
  tz: string | null;
  image: string | null;
  isMe: boolean;
  /** Members: calendar filled. Guests: painted something. */
  answered: boolean;
}

export interface DayEval {
  date: string; // YYYY-MM-DD (viewer timezone)
  start: number; // ms UTC of the window start (dayStart, local)
  minutes: number; // window length
  /** Per participant: result for a meeting starting at minute s (0 / 1 / 2). */
  starts: Uint8Array[];
  /** Popularity runs [from, to, level 1..HEAT_LEVELS]: how many people are available. */
  heat: [number, number, number][];
}

export interface MeetingEval {
  participants: GridParticipant[];
  days: DayEval[];
  duration: number;
}

/** The visible window of each meeting day, in the viewer's timezone. */
export function dayWindows(meeting: MeetingConfig, tz: string) {
  return enumerateDates(meeting.dateMin, meeting.dateMax).map((date) => {
    const day = DateTime.fromISO(date, { zone: tz }).startOf('day');
    const start = day.set({ hour: meeting.dayStart }).toMillis();
    const end =
      meeting.dayEnd >= 24
        ? day.plus({ days: 1 }).toMillis()
        : day.set({ hour: meeting.dayEnd }).toMillis();
    return { date, start, end, minutes: Math.round((end - start) / MIN) };
  });
}

/** Mark minutes of [s, e) with `value` (conservative: any overlap counts). */
function markOverlap(arr: Uint8Array, w0: number, s: number, e: number, value: number, onlyIf?: number) {
  const from = Math.max(0, Math.floor((s - w0) / MIN));
  const to = Math.min(arr.length, Math.ceil((e - w0) / MIN));
  for (let m = from; m < to; m += 1) if (onlyIf === undefined || arr[m] === onlyIf) arr[m] = value;
}

/** Mark minutes fully inside [s, e) with `value`. */
function markInside(arr: Uint8Array, w0: number, s: number, e: number, value: number) {
  const from = Math.max(0, Math.ceil((s - w0) / MIN));
  const to = Math.min(arr.length, Math.floor((e - w0) / MIN));
  for (let m = from; m < to; m += 1) arr[m] = value;
}

const toMs = (list: Interval[]) => list.map(([s, e]) => [Date.parse(s), Date.parse(e)] as const);

/** Per start minute: can this person attend the whole meeting? */
function startResults(avail: Uint8Array, duration: number): Uint8Array {
  const n = avail.length;
  const zeros = new Int32Array(n + 1);
  const ones = new Int32Array(n + 1);
  for (let m = 0; m < n; m += 1) {
    zeros[m + 1] = zeros[m] + (avail[m] === 0 ? 1 : 0);
    ones[m + 1] = ones[m] + (avail[m] === 1 ? 1 : 0);
  }
  const out = new Uint8Array(n);
  for (let s = 0; s + duration <= n; s += 1) {
    if (zeros[s + duration] - zeros[s] > 0) continue;
    out[s] = ones[s + duration] - ones[s] > 0 ? 1 : 2;
  }
  return out;
}

export const HEAT_LEVELS = 4;

/**
 * Popularity of each minute: share of these people available ("si besoin"
 * counts half), quantized to 0..HEAT_LEVELS and merged into runs (level 0 omitted).
 */
function heatRuns(avails: Uint8Array[], minutes: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  if (avails.length === 0) return out;
  let from = 0;
  let prev = -1;
  for (let m = 0; m <= minutes; m += 1) {
    let level = -1;
    if (m < minutes) {
      let sum = 0;
      for (const a of avails) sum += a[m] === 2 ? 2 : a[m] === 1 ? 1 : 0;
      level = Math.round((sum / (2 * avails.length)) * HEAT_LEVELS);
    }
    if (level !== prev) {
      if (prev > 0) out.push([from, m, prev]);
      from = m;
      prev = level;
    }
  }
  return out;
}

/**
 * Evaluate a meeting for the viewer's timezone. `myIntervals` overrides the
 * viewing guest's saved painting (live, unsaved edits).
 */
export function evaluateMeeting(
  detail: MeetingDetail,
  tz: string,
  myIntervals?: MsInterval[],
): MeetingEval {
  const { meeting, viewer } = detail;
  const windows = dayWindows(meeting, tz);
  const participants: GridParticipant[] = [];
  const perDayAvail: Uint8Array[][] = windows.map(() => []);
  // Who counts for the popularity background: everyone (no answer = not
  // available) except the viewing guest, whose own painting is drawn as is.
  const inHeat: boolean[] = [];

  for (const m of detail.members) {
    participants.push({
      id: `m:${m.id}`,
      name: m.name,
      kind: 'member',
      tz: m.timezone,
      image: m.image,
      isMe: viewer.kind === 'member' && viewer.memberId === m.id,
      answered: m.calendarFilled,
    });
    inHeat.push(true);
    const busy = toMs(m.busy);
    const soft = toMs(m.soft);
    windows.forEach((w, d) => {
      const arr = new Uint8Array(w.minutes);
      if (m.calendarFilled) {
        arr.fill(2);
        for (const [s, e] of soft) markOverlap(arr, w.start, s, e, 1, 2);
        for (const [s, e] of busy) markOverlap(arr, w.start, s, e, 0);
      }
      perDayAvail[d].push(arr);
    });
  }

  for (const g of detail.guests) {
    const isMe = viewer.kind === 'guest' && viewer.guestId === g.id;
    const intervals = isMe && myIntervals ? myIntervals : fromIso(g.intervals);
    participants.push({
      id: `g:${g.id}`,
      name: g.name,
      kind: 'guest',
      tz: g.timezone,
      image: null,
      isMe,
      answered: intervals.length > 0,
    });
    inHeat.push(!isMe);
    windows.forEach((w, d) => {
      const arr = new Uint8Array(w.minutes);
      for (const i of intervals) markInside(arr, w.start, i.start, i.end, i.status === 'yes' ? 2 : 1);
      perDayAvail[d].push(arr);
    });
  }

  return {
    participants,
    duration: meeting.duration,
    days: windows.map((w, d) => ({
      date: w.date,
      start: w.start,
      minutes: w.minutes,
      starts: perDayAvail[d].map((a) => startResults(a, meeting.duration)),
      heat: heatRuns(perDayAvail[d].filter((_, p) => inHeat[p]), w.minutes),
    })),
  };
}

export interface AvailabilityRange {
  day: number;
  startMin: number; // first possible start (minutes from the window start)
  endMin: number; // end of a meeting started at the last possible start
  startUtc: string;
  endUtc: string;
  ids: string[];
  names: string[];
  count: number;
  ifNeeded: number;
}

const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

/**
 * Windows in which the meeting fits: consecutive start minutes with the same
 * people (and statuses) are merged; a window runs from its first start to the
 * end of a meeting started at its last start.
 */
export function computeRanges(ev: MeetingEval): AvailabilityRange[] {
  const { participants, duration } = ev;
  const ranges: AvailabilityRange[] = [];
  ev.days.forEach((day, d) => {
    let current: AvailabilityRange | null = null;
    let sig = '';
    let last = -2;
    for (let s = 0; s < day.minutes; s += 1) {
      let code = '';
      let any = false;
      for (let p = 0; p < participants.length; p += 1) {
        const v = day.starts[p][s];
        if (v) any = true;
        code += v;
      }
      if (!any) continue;
      if (current && code === sig && last === s - 1) {
        current.endMin = s + duration;
        last = s;
        continue;
      }
      if (current) ranges.push(current);
      const ids: string[] = [];
      const names: string[] = [];
      let ifNeeded = 0;
      participants.forEach((p, i) => {
        const v = day.starts[i][s];
        if (!v) return;
        ids.push(p.id);
        names.push(p.name);
        if (v === 1) ifNeeded += 1;
      });
      current = { day: d, startMin: s, endMin: s + duration, startUtc: '', endUtc: '', ids, names, count: ids.length, ifNeeded };
      sig = code;
      last = s;
    }
    if (current) ranges.push(current);
  });
  for (const r of ranges) {
    const day = ev.days[r.day];
    r.startUtc = iso(day.start + r.startMin * MIN);
    r.endUtc = iso(day.start + r.endMin * MIN);
  }
  return ranges;
}

export type BlockKind = 'match' | 'maybe';

export interface ResultBlock {
  kind: BlockKind;
  startMin: number;
  endMin: number;
}

function merge(list: [number, number][]): [number, number][] {
  const merged: [number, number][] = [];
  for (const [s, e] of [...list].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

/**
 * Where the meeting fits for everyone on one day, merged per kind ("maybe"
 * first, "match" drawn on top). Partial results are shown by the popularity
 * background, not by blocks.
 */
export function dayBlocks(ranges: AvailabilityRange[], day: number, total: number): ResultBlock[] {
  const byKind: Record<BlockKind, [number, number][]> = { maybe: [], match: [] };
  for (const r of ranges) {
    if (r.day !== day || r.count !== total) continue;
    byKind[r.ifNeeded > 0 ? 'maybe' : 'match'].push([r.startMin, r.endMin]);
  }
  return (['maybe', 'match'] as BlockKind[]).flatMap((kind) =>
    merge(byKind[kind]).map(([s, e]) => ({ kind, startMin: s, endMin: e })),
  );
}
