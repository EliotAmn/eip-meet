import type { Interval, MeetingConfig, MeetingDetail, SlotStatus } from './types';
import { addMinutes, cellToUtc, enumerateDates, rowCount } from './time';

export interface GridParticipant {
  id: string; // "m:<memberId>" or "g:<guestId>"
  name: string;
  kind: 'member' | 'guest';
  tz: string | null;
  image: string | null;
  isMe: boolean;
  /** Members: calendar filled. Guests: painted at least one slot. */
  answered: boolean;
}

/** slot key (UTC ISO start) -> participant id -> status (absent = unavailable) */
export type StatusMap = Map<string, Map<string, SlotStatus>>;

/** Every slot of the meeting grid, as seen from `tz`, sorted. */
export function meetingSlotKeys(meeting: MeetingConfig, tz: string): string[] {
  const keys: string[] = [];
  const rows = rowCount(meeting.dayStart, meeting.dayEnd, meeting.granularity);
  for (const date of enumerateDates(meeting.dateMin, meeting.dateMax)) {
    for (let r = 0; r < rows; r += 1) {
      keys.push(cellToUtc(date, r, meeting.dayStart, meeting.granularity, tz));
    }
  }
  return keys.sort();
}

const toMs = (list: Interval[]) => list.map(([s, e]) => [Date.parse(s), Date.parse(e)] as const);
const overlaps = (list: (readonly [number, number])[], s: number, e: number) =>
  list.some(([a, b]) => a < e && b > s);

/**
 * Build the per-slot statuses of everyone in a meeting.
 * - members: available unless the slot overlaps a busy interval; "si besoin"
 *   when it overlaps a soft one; nothing at all if their calendar is empty
 * - guests: what they painted (`mySlots` overrides the viewing guest, live)
 */
export function buildAvailability(
  detail: MeetingDetail,
  tz: string,
  keys: string[],
  mySlots?: Map<string, SlotStatus>,
): { participants: GridParticipant[]; statuses: StatusMap } {
  const { meeting, viewer } = detail;
  const statuses: StatusMap = new Map(keys.map((k) => [k, new Map()]));
  const participants: GridParticipant[] = [];
  const g = meeting.granularity;

  for (const m of detail.members) {
    const id = `m:${m.id}`;
    participants.push({
      id,
      name: m.name,
      kind: 'member',
      tz: m.timezone,
      image: m.image,
      isMe: viewer.kind === 'member' && viewer.memberId === m.id,
      answered: m.calendarFilled,
    });
    if (!m.calendarFilled) continue;
    const busy = toMs(m.busy);
    const soft = toMs(m.soft);
    for (const k of keys) {
      const s = Date.parse(k);
      const e = s + g * 60_000;
      if (overlaps(busy, s, e)) continue;
      statuses.get(k)!.set(id, overlaps(soft, s, e) ? 'if_needed' : 'yes');
    }
  }

  for (const guest of detail.guests) {
    const id = `g:${guest.id}`;
    const isMe = viewer.kind === 'guest' && viewer.guestId === guest.id;
    const slots =
      isMe && mySlots
        ? mySlots
        : new Map(guest.slots.map((sl) => [sl.start, sl.status] as const));
    participants.push({
      id,
      name: guest.name,
      kind: 'guest',
      tz: guest.timezone,
      image: null,
      isMe,
      answered: slots.size > 0,
    });
    for (const [k, st] of slots) statuses.get(k)?.set(id, st);
  }

  return { participants, statuses };
}

export interface AvailabilityRange {
  startUtc: string;
  endUtc: string;
  ids: string[];
  names: string[];
  count: number;
  ifNeeded: number;
}

/**
 * Collapse contiguous slots with the same people (and statuses) into ranges,
 * sorted chronologically.
 */
/**
 * Per-start statuses for a meeting of `duration` minutes: someone is available
 * to start at a slot only if they are available on every slot the meeting
 * covers ("si besoin" if any of them is). The meeting must also fit in the
 * grid (all covered slots exist), so it never runs past the visible window.
 */
export function startStatuses(
  keys: string[],
  statuses: StatusMap,
  granularity: number,
  duration: number,
): StatusMap {
  const steps = Math.max(1, Math.round(duration / granularity));
  const out: StatusMap = new Map();
  for (const key of keys) {
    const covered: Map<string, SlotStatus>[] = [];
    for (let i = 0; i < steps; i += 1) {
      const st = statuses.get(i === 0 ? key : addMinutes(key, i * granularity));
      if (!st) break;
      covered.push(st);
    }
    const result = new Map<string, SlotStatus>();
    if (covered.length === steps) {
      for (const [id, first] of covered[0]) {
        let status: SlotStatus = first;
        let ok = true;
        for (let i = 1; i < steps && ok; i += 1) {
          const s = covered[i].get(id);
          if (!s) ok = false;
          else if (s === 'if_needed') status = 'if_needed';
        }
        if (ok) result.set(id, status);
      }
    }
    out.set(key, result);
  }
  return out;
}

/**
 * Collapse contiguous possible start times with the same people (and
 * statuses) into ranges. A range spans from its first start to the end of a
 * meeting started at its last start, i.e. the window the meeting fits in.
 */
export function computeRanges(
  keys: string[],
  starts: StatusMap,
  participants: GridParticipant[],
  granularity: number,
  duration: number,
): AvailabilityRange[] {
  const nameOf = new Map(participants.map((p) => [p.id, p.name]));
  const ranges: AvailabilityRange[] = [];
  let current: AvailabilityRange | null = null;
  let currentSig = '';
  let lastStart = '';

  for (const key of keys) {
    const st = starts.get(key);
    if (!st || st.size === 0) {
      if (current) ranges.push(current);
      current = null;
      currentSig = '';
      continue;
    }
    const entries = [...st.entries()].sort(([a], [b]) => a.localeCompare(b));
    const sig = entries.map(([id, s]) => `${id}=${s}`).join('|');
    if (current && sig === currentSig && addMinutes(lastStart, granularity) === key) {
      current.endUtc = addMinutes(key, duration);
      lastStart = key;
      continue;
    }
    if (current) ranges.push(current);
    current = {
      startUtc: key,
      endUtc: addMinutes(key, duration),
      ids: entries.map(([id]) => id),
      names: entries.map(([id]) => nameOf.get(id) ?? '?'),
      count: entries.length,
      ifNeeded: entries.filter(([, s]) => s === 'if_needed').length,
    };
    currentSig = sig;
    lastStart = key;
  }
  if (current) ranges.push(current);
  return ranges;
}
