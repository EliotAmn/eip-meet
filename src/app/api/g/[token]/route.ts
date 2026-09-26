import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildMeetingDetail } from '@/lib/server';
import { isValidTimezone } from '@/lib/validate';

type Ctx = { params: Promise<{ token: string }> };

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/;

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

/** Replace the guest's painted availability. */
export async function PUT(request: Request, ctx: Ctx) {
  const guest = await guestFor(ctx);
  if (!guest) return NextResponse.json({ error: 'Lien invalide.' }, { status: 404 });

  const body = (await request.json().catch(() => null)) as
    | { slots?: unknown; timezone?: unknown }
    | null;
  if (!Array.isArray(body?.slots)) {
    return NextResponse.json({ error: 'Champ "slots" manquant.' }, { status: 400 });
  }
  const byStart = new Map<string, 'yes' | 'if_needed'>();
  for (const raw of body.slots) {
    if (typeof raw !== 'object' || raw === null) continue;
    const { start, status } = raw as { start?: unknown; status?: unknown };
    if (typeof start !== 'string' || !ISO_UTC_RE.test(start)) continue;
    byStart.set(start, status === 'if_needed' ? 'if_needed' : 'yes');
  }
  if (byStart.size > 20000) {
    return NextResponse.json({ error: 'Trop de créneaux.' }, { status: 400 });
  }
  const timezone = isValidTimezone(body.timezone) ? body.timezone : undefined;

  await prisma.$transaction([
    prisma.guestSlot.deleteMany({ where: { guestId: guest.id } }),
    prisma.guestSlot.createMany({
      data: Array.from(byStart, ([startUtc, status]) => ({ guestId: guest.id, startUtc, status })),
    }),
    ...(timezone
      ? [prisma.guest.update({ where: { id: guest.id }, data: { timezone } })]
      : []),
  ]);
  return NextResponse.json({ ok: true, count: byStart.size });
}
