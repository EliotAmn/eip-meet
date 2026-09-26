import type { AvailInterval, SlotStatus } from './types';

// Painted availability as non-overlapping [start, end) intervals (ms UTC),
// sorted, with adjacent intervals of the same status merged.

export interface MsInterval {
  start: number;
  end: number;
  status: SlotStatus;
}

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/;

function mergeAdjacent(list: MsInterval[]): MsInterval[] {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const out: MsInterval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && last.status === i.status && i.start <= last.end) {
      last.end = Math.max(last.end, i.end);
    } else {
      out.push({ ...i });
    }
  }
  return out;
}

/** Set [start, end) to `status` (or clear it when null), overriding what was there. */
export function setRange(
  list: MsInterval[],
  start: number,
  end: number,
  status: SlotStatus | null,
): MsInterval[] {
  if (end <= start) return list;
  const out: MsInterval[] = [];
  for (const i of list) {
    if (i.end <= start || i.start >= end) {
      out.push(i);
      continue;
    }
    if (i.start < start) out.push({ start: i.start, end: start, status: i.status });
    if (i.end > end) out.push({ start: end, end: i.end, status: i.status });
  }
  if (status) out.push({ start, end, status });
  return mergeAdjacent(out);
}

/** True if [start, end) is entirely covered by intervals of `status`. */
export function isCovered(
  list: MsInterval[],
  start: number,
  end: number,
  status: SlotStatus,
): boolean {
  let cursor = start;
  for (const i of list) {
    if (i.end <= cursor || i.status !== status) continue;
    if (i.start > cursor) return false;
    cursor = i.end;
    if (cursor >= end) return true;
  }
  return cursor >= end;
}

export const fromIso = (list: AvailInterval[]): MsInterval[] =>
  mergeAdjacent(
    list.map((i) => ({ start: Date.parse(i.start), end: Date.parse(i.end), status: i.status })),
  );

const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

export const toIso = (list: MsInterval[]): AvailInterval[] =>
  list.map((i) => ({ start: iso(i.start), end: iso(i.end), status: i.status }));

/** Validate untrusted input and return a clean, non-overlapping list. */
export function normalizeIntervals(raw: unknown[]): AvailInterval[] {
  let list: MsInterval[] = [];
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) continue;
    const { start, end, status } = r as { start?: unknown; end?: unknown; status?: unknown };
    if (typeof start !== 'string' || typeof end !== 'string') continue;
    if (!ISO_UTC_RE.test(start) || !ISO_UTC_RE.test(end)) continue;
    const s = Date.parse(start);
    const e = Date.parse(end);
    if (!(e > s) || e - s > 366 * 86400e3) continue;
    list = setRange(list, s, e, status === 'if_needed' ? 'if_needed' : 'yes');
  }
  return toIso(list);
}
