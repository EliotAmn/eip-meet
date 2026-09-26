import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildMeetingDetail } from '@/lib/server';
import { isValidTimezone } from '@/lib/validate';
import { normalizeIntervals } from '@/lib/intervals';
import { GUEST_STEPS } from '@/lib/types';

type Ctx = { params: Promise<{ token: string }> };

async function guestFor(ctx: Ctx) {
  const { token } = await ctx.params;
  return prisma.guest.findUnique({ where: { token } });
}

/** Meeting view for a guest (no account, personal link). */
export async function GET(_request: Request, ctx: Ctx) {
  const guest = await guestFor(ctx);
  if (!guest) return NextResponse.json({ error: 'Lien invalide.' }, { status: 404 });
  const detail = await buildMeetingDetail(
    guest.meetingId,
    { kind: 'guest', guestId: guest.id, name: guest.name },
    { includeEmails: false, includeTokens: false },
  );
  return NextResponse.json(detail);
}

/** Replace the guest's painted availability (intervals) and grid step. */
export async function PUT(request: Request, ctx: Ctx) {
  const guest = await guestFor(ctx);
  if (!guest) return NextResponse.json({ error: 'Lien invalide.' }, { status: 404 });

  const body = (await request.json().catch(() => null)) as
    | { intervals?: unknown; timezone?: unknown; step?: unknown }
    | null;
  if (!Array.isArray(body?.intervals)) {
    return NextResponse.json({ error: 'Champ "intervals" manquant.' }, { status: 400 });
  }
  const intervals = normalizeIntervals(body.intervals);
  if (intervals.length > 5000) {
    return NextResponse.json({ error: 'Trop de plages.' }, { status: 400 });
  }
  const timezone = isValidTimezone(body.timezone) ? body.timezone : undefined;
  const step = (GUEST_STEPS as readonly number[]).includes(Number(body.step))
    ? Number(body.step)
    : undefined;

  await prisma.$transaction([
    prisma.guestSlot.deleteMany({ where: { guestId: guest.id } }),
    prisma.guestSlot.createMany({
      data: intervals.map((i) => ({
        guestId: guest.id,
        startUtc: i.start,
        endUtc: i.end,
        status: i.status,
      })),
    }),
    ...(timezone || step
      ? [
          prisma.guest.update({
            where: { id: guest.id },
            data: { ...(timezone ? { timezone } : {}), ...(step ? { step } : {}) },
          }),
        ]
      : []),
  ]);
  return NextResponse.json({ ok: true, count: intervals.length });
}
