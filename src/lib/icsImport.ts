import { DateTime } from 'luxon';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { parseIcs, type IcsIgnored, type IcsItem } from './ics';
import type { UnavailabilityInput, UnavailabilityType } from './types';
import { unavailabilityData } from '@/app/api/unavailabilities/data';

// Diff an .ics file against the user's calendar. Imported rows keep the file's
// key and a hash of what the file said: same hash = unchanged (local edits are
// kept), other hash = update, key gone from the file = delete (same calendar
// only, never past events). A manual event identical to a new one is linked
// instead of duplicated.

export type IcsAction = 'create' | 'update' | 'delete';

export interface IcsChange {
  key: string;
  action: IcsAction;
  title: string | null;
  type: UnavailabilityType;
  when: string;
  /** For updates: what it was. */
  before?: string;
}

export interface IcsPreview {
  source: string;
  changes: IcsChange[];
  unchanged: number;
  linked: number;
  ignored: IcsIgnored;
}

export interface IcsResult {
  created: number;
  updated: number;
  deleted: number;
  linked: number;
}

type Row = Prisma.UnavailabilityGetPayload<{ include: { exceptions: true } }>;

const WD = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const day = (iso: string) => DateTime.fromISO(iso).setLocale('fr').toFormat('ccc d LLL yyyy');

/** "jeu. 1 oct. 2026, 10:00 - 11:00 · chaque semaine (jeu.)" */
export function describe(
  i: Omit<UnavailabilityInput, 'title' | 'type'>,
  userTz: string,
  exceptions = 0,
): string {
  let s = i.allDay
    ? i.endDate !== i.startDate
      ? `${day(i.startDate)} - ${day(i.endDate)} (journées)`
      : `${day(i.startDate)} (journée)`
    : `${day(i.startDate)}, ${i.startTime} - ${i.endTime}`;
  if (i.freq !== 'none') {
    const n = i.interval;
    const rule =
      i.freq === 'daily'
        ? n > 1 ? `tous les ${n} jours` : 'tous les jours'
        : i.freq === 'weekly'
          ? `${n > 1 ? `toutes les ${n} semaines` : 'chaque semaine'} (${i.byWeekday.map((w) => WD[w - 1]).join(', ')})`
          : n > 1 ? `tous les ${n} mois` : 'chaque mois';
    s += ` · ${rule}${i.until ? ` jusqu'au ${day(i.until)}` : ''}`;
    if (exceptions) s += ` · ${exceptions} date${exceptions > 1 ? 's' : ''} modifiée${exceptions > 1 ? 's' : ''} ou annulée${exceptions > 1 ? 's' : ''}`;
  }
  if (i.timezone !== userTz) s += ` · ${i.timezone}`;
  return s;
}

function rowInput(r: Row): Omit<UnavailabilityInput, 'title' | 'type'> {
  return {
    allDay: r.allDay,
    startDate: r.startDate,
    endDate: r.endDate,
    startTime: r.startTime,
    endTime: r.endTime,
    timezone: r.timezone,
    freq: r.freq as UnavailabilityInput['freq'],
    interval: r.interval,
    byWeekday: r.byWeekday ? r.byWeekday.split(',').map(Number) : [],
    until: r.until,
  };
}

/** Same time slots (title and type aside): an existing manual event. */
const timing = (i: Omit<UnavailabilityInput, 'title' | 'type'>) =>
  JSON.stringify([i.allDay, i.startDate, i.endDate, i.startTime, i.endTime, i.timezone, i.freq, i.interval, i.byWeekday.join(','), i.until]);

function isPast(r: Row, today: string) {
  return r.freq === 'none' ? r.endDate < today : !!r.until && r.until < today;
}

interface Plan {
  source: string;
  creates: IcsItem[];
  updates: { item: IcsItem; row: Row }[];
  deletes: Row[];
  links: { item: IcsItem; row: Row }[];
  resourced: Row[]; // unchanged rows now coming from this source
  unchanged: number;
  ignored: IcsIgnored;
}

async function plan(userId: string, text: string, fileName: string, userTz: string): Promise<Plan> {
  const parsed = parseIcs(text, userTz);
  const source = (parsed.calendarName ?? fileName.replace(/\.ics$/i, '')).slice(0, 200) || 'Calendrier';
  const today = DateTime.now().setZone(userTz).toISODate()!;
  const rows = await prisma.unavailability.findMany({ where: { userId }, include: { exceptions: true } });
  const byKey = new Map(rows.filter((r) => r.icsKey).map((r) => [r.icsKey!, r]));
  const manual = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.icsKey) continue;
    const t = timing(rowInput(r));
    manual.set(t, [...(manual.get(t) ?? []), r]);
  }

  const p: Plan = { source, creates: [], updates: [], deletes: [], links: [], resourced: [], unchanged: 0, ignored: parsed.ignored };
  const keys = new Set<string>();
  for (const item of parsed.items) {
    keys.add(item.key);
    const row = byKey.get(item.key);
    if (row) {
      if (row.icsHash === item.hash) {
        p.unchanged += 1;
        if (row.icsSource !== source) p.resourced.push(row);
      } else p.updates.push({ item, row });
      continue;
    }
    const twin = manual.get(timing(item.input))?.shift();
    if (twin) p.links.push({ item, row: twin });
    else p.creates.push(item);
  }
  p.deletes = rows.filter((r) => r.icsKey && r.icsSource === source && !keys.has(r.icsKey) && !isPast(r, today));
  return p;
}

export async function previewIcs(userId: string, text: string, fileName: string, userTz: string): Promise<IcsPreview> {
  const p = await plan(userId, text, fileName, userTz);
  const type = (t: string): UnavailabilityType => (t === 'soft' ? 'soft' : 'busy');
  const changes: IcsChange[] = [
    ...p.creates.map((i) => ({ key: i.key, action: 'create' as const, title: i.input.title, type: i.input.type, when: describe(i.input, userTz, i.exceptions.length) })),
    ...p.updates.map(({ item, row }) => ({
      key: item.key,
      action: 'update' as const,
      title: item.input.title,
      type: item.input.type,
      when: describe(item.input, userTz, item.exceptions.length),
      before: `${row.title ?? 'Sans titre'} · ${describe(rowInput(row), userTz, row.exceptions.length)}`,
    })),
    ...p.deletes.map((r) => ({ key: r.icsKey!, action: 'delete' as const, title: r.title, type: type(r.type), when: describe(rowInput(r), userTz, r.exceptions.length) })),
  ];
  return { source: p.source, changes, unchanged: p.unchanged, linked: p.links.length, ignored: p.ignored };
}

const exceptionRows = (item: IcsItem) =>
  item.exceptions.map((x) => ({
    date: x.date,
    cancelled: x.cancelled,
    title: x.title,
    type: x.type,
    startTime: x.startTime,
    endTime: x.endTime,
  }));

export async function applyIcs(
  userId: string,
  text: string,
  fileName: string,
  userTz: string,
  exclude: Set<string>,
): Promise<IcsResult> {
  const p = await plan(userId, text, fileName, userTz);
  const keep = <T>(list: T[], key: (x: T) => string) => list.filter((x) => !exclude.has(key(x)));
  const creates = keep(p.creates, (i) => i.key);
  const updates = keep(p.updates, (u) => u.item.key);
  const deletes = keep(p.deletes, (r) => r.icsKey!);
  const ics = (item: IcsItem) => ({ icsKey: item.key, icsSource: p.source, icsHash: item.hash });

  await prisma.$transaction([
    ...creates.map((item) =>
      prisma.unavailability.create({
        data: {
          userId,
          ...unavailabilityData(item.input),
          ...ics(item),
          exceptions: { create: exceptionRows(item) },
        },
      }),
    ),
    ...updates.flatMap(({ item, row }) => [
      prisma.unavailabilityException.deleteMany({ where: { eventId: row.id } }),
      prisma.unavailability.update({
        where: { id: row.id },
        data: { ...unavailabilityData(item.input), ...ics(item), exceptions: { create: exceptionRows(item) } },
      }),
    ]),
    ...(deletes.length
      ? [prisma.unavailability.deleteMany({ where: { userId, id: { in: deletes.map((r) => r.id) } } })]
      : []),
    ...p.links.map(({ item, row }) => prisma.unavailability.update({ where: { id: row.id }, data: ics(item) })),
    ...p.resourced.map((row) =>
      prisma.unavailability.update({ where: { id: row.id }, data: { icsSource: p.source } }),
    ),
  ]);
  return { created: creates.length, updated: updates.length, deleted: deletes.length, linked: p.links.length };
}
