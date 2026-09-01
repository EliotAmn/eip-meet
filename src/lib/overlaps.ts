import type { ParticipantPublic } from './types';
import { addMinutes } from './time';

export interface AvailabilityRange {
  startUtc: string;
  endUtc: string;
  ids: string[];
  names: string[];
  count: number;
}

/**
 * Build the map: slot start (UTC ISO) -> participants available at that slot.
 */
export function slotAvailabilityMap(
  participants: ParticipantPublic[],
): Map<string, { ids: string[]; names: string[] }> {
  const map = new Map<string, { ids: string[]; names: string[] }>();
  for (const p of participants) {
    for (const slot of p.slots) {
      const entry = map.get(slot) ?? { ids: [], names: [] };
      entry.ids.push(p.id);
      entry.names.push(p.name);
      map.set(slot, entry);
    }
  }
  return map;
}

/**
 * Collapse contiguous slots that share the exact same set of available
 * participants into ranges. Returned sorted by start time (nearest first).
 */
export function computeAvailabilityRanges(
  participants: ParticipantPublic[],
  granularity: number,
): AvailabilityRange[] {
  const map = slotAvailabilityMap(participants);
  const keys = Array.from(map.keys()).sort(); // ISO UTC sorts chronologically

  const ranges: AvailabilityRange[] = [];
  let current: AvailabilityRange | null = null;
  let currentSig = '';

  for (const key of keys) {
    const entry = map.get(key)!;
    // Signature = the exact set of available participants (order-independent).
    const sig = [...entry.ids].sort().join('|');

    // Extend the current range only if it has the same participant set AND
    // this slot starts exactly where the current range ends (contiguous).
    if (current && currentSig === sig && current.endUtc === key) {
      current.endUtc = addMinutes(key, granularity);
      continue;
    }

    if (current) ranges.push(current);
    // Keep names paired with their ids for stable display.
    const pairs = entry.ids
      .map((id, i) => ({ id, name: entry.names[i] }))
      .sort((a, b) => a.id.localeCompare(b.id));
    current = {
      startUtc: key,
      endUtc: addMinutes(key, granularity),
      ids: pairs.map((p) => p.id),
      names: pairs.map((p) => p.name),
      count: entry.ids.length,
    };
    currentSig = sig;
  }
  if (current) ranges.push(current);

  return ranges.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}
