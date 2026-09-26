import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/server';
import { validateUnavailability, ValidationError } from '@/lib/validate';
import type { EditScope } from '@/lib/types';
import { unavailabilityData } from '../data';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayBefore = (d: string) => DateTime.fromISO(d).minus({ days: 1 }).toISODate()!;
const addDays = (d: string, n: number) => DateTime.fromISO(d).plus({ days: n }).toISODate()!;
const daysBetween = (a: string, b: string) =>
  Math.round(DateTime.fromISO(b).diff(DateTime.fromISO(a), 'days').days);

function parseScope(scope: unknown, date: unknown): { scope: EditScope; date: string | null } {
  const s: EditScope = scope === 'this' || scope === 'following' ? scope : 'all';
  const d = typeof date === 'string' && DATE_RE.test(date) ? date : null;
  if (s !== 'all' && !d) throw new ValidationError('Date d’occurrence manquante.');
  return { scope: s, date: d };
}

async function load(id: string) {
  const user = await currentUser();
  if (!user) return { error: NextResponse.json({ error: 'Connexion requise.' }, { status: 401 }) };
  const ev = await prisma.unavailability.findFirst({ where: { id, userId: user.id } });
  if (!ev) return { error: NextResponse.json({ error: 'Événement introuvable.' }, { status: 404 }) };
  return { user, ev };
}

/**
 * Edit an unavailability.
 * - all: change the whole series (its first date is kept for recurring events)
 * - this: override a single occurrence (exception)
 * - following: end the series the day before, start a new one from `date`
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const loaded = await load(id);
  if ('error' in loaded) return loaded.error;
  const { ev } = loaded;

  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const input = validateUnavailability(body.data);
    const { scope, date } = parseScope(body.scope, body.date);
    const recurring = ev.freq !== 'none';
    const span = daysBetween(input.startDate, input.endDate);

    if (!recurring || scope === 'all' || (scope === 'following' && date! <= ev.startDate)) {
      const data = unavailabilityData(input);
      if (recurring) {
        // Occurrence dates are not editable on a series: keep its anchor.
        data.startDate = ev.startDate;
        data.endDate = addDays(ev.startDate, span);
        if (data.until && data.until < data.startDate) data.until = null;
      }
      await prisma.unavailability.update({ where: { id }, data });
    } else if (scope === 'this') {
      const override = {
        cancelled: false,
        title: input.title,
        type: input.type,
        startTime: ev.allDay ? null : input.startTime,
        endTime: ev.allDay ? null : input.endTime,
      };
      await prisma.unavailabilityException.upsert({
        where: { eventId_date: { eventId: id, date: date! } },
        create: { eventId: id, date: date!, ...override },
        update: override,
      });
    } else {
      // following
      const data = unavailabilityData(input);
      data.startDate = date!;
      data.endDate = addDays(date!, span);
      if (data.until && data.until < date!) data.until = null;
      await prisma.$transaction([
        prisma.unavailability.update({ where: { id }, data: { until: dayBefore(date!) } }),
        prisma.unavailabilityException.deleteMany({ where: { eventId: id, date: { gte: date! } } }),
        prisma.unavailability.create({ data: { userId: ev.userId, ...data } }),
      ]);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

/** Delete an unavailability: this occurrence, this and following, or all. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const loaded = await load(id);
  if ('error' in loaded) return loaded.error;
  const { ev } = loaded;

  try {
    const url = new URL(request.url);
    const { scope, date } = parseScope(url.searchParams.get('scope'), url.searchParams.get('date'));
    const recurring = ev.freq !== 'none';

    if (!recurring || scope === 'all' || (scope === 'following' && date! <= ev.startDate)) {
      await prisma.unavailability.delete({ where: { id } });
    } else if (scope === 'this') {
      const cancel = { cancelled: true, title: null, type: null, startTime: null, endTime: null };
      await prisma.unavailabilityException.upsert({
        where: { eventId_date: { eventId: id, date: date! } },
        create: { eventId: id, date: date!, ...cancel },
        update: cancel,
      });
    } else {
      await prisma.$transaction([
        prisma.unavailability.update({ where: { id }, data: { until: dayBefore(date!) } }),
        prisma.unavailabilityException.deleteMany({ where: { eventId: id, date: { gte: date! } } }),
      ]);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
