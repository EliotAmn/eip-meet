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
export function computeRanges(
  keys: string[],
  statuses: StatusMap,
  participants: GridParticipant[],
  granularity: number,
): AvailabilityRange[] {
  const nameOf = new Map(participants.map((p) => [p.id, p.name]));
  const ranges: AvailabilityRange[] = [];
  let current: AvailabilityRange | null = null;
  let currentSig = '';

  for (const key of keys) {
    const st = statuses.get(key);
    if (!st || st.size === 0) {
      if (current) ranges.push(current);
      current = null;
      currentSig = '';
      continue;
    }
    const entries = [...st.entries()].sort(([a], [b]) => a.localeCompare(b));
    const sig = entries.map(([id, s]) => `${id}=${s}`).join('|');
    if (current && sig === currentSig && current.endUtc === key) {
      current.endUtc = addMinutes(key, granularity);
      continue;
    }
    if (current) ranges.push(current);
    current = {
      startUtc: key,
      endUtc: addMinutes(key, granularity),
      ids: entries.map(([id]) => id),
      names: entries.map(([id]) => nameOf.get(id) ?? '?'),
      count: entries.length,
      ifNeeded: entries.filter(([, s]) => s === 'if_needed').length,
    };
    currentSig = sig;
  }
  if (current) ranges.push(current);
  return ranges;
}
