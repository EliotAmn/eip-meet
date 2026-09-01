import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { prisma } from '@/lib/prisma';

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/;

/** Accept a value only if it's a real IANA timezone. */
function normalizeTimezone(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) {
    return undefined;
  }
  return DateTime.now().setZone(value).isValid ? value : undefined;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const me = await prisma.participant.findUnique({
    where: { token },
    select: { id: true },
  });
  if (!me) {
    return NextResponse.json({ error: 'Lien invalide.' }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'JSON invalide.' }, { status: 400 });
  }

  const rawSlots = Array.isArray(body.slots) ? body.slots : null;
  if (!rawSlots) {
    return NextResponse.json({ error: 'Champ "slots" manquant.' }, { status: 400 });
  }

  // Normalize + validate: keep only well-formed UTC instants, dedup.
  const slots = Array.from(
    new Set(
      rawSlots
        .filter((s): s is string => typeof s === 'string')
        .filter((s) => ISO_UTC_RE.test(s)),
    ),
  );
  if (slots.length > 20000) {
    return NextResponse.json({ error: 'Trop de créneaux.' }, { status: 400 });
  }

  const timezone = normalizeTimezone(body.timezone);

  // Replace the participant's availability atomically, and remember the
  // timezone they answered from (so others can see each person's local time).
  await prisma.$transaction([
    prisma.slot.deleteMany({ where: { participantId: me.id } }),
    prisma.slot.createMany({
      data: slots.map((startUtc) => ({ participantId: me.id, startUtc })),
    }),
    ...(timezone
      ? [prisma.participant.update({ where: { id: me.id }, data: { timezone } })]
      : []),
  ]);

  return NextResponse.json({ ok: true, count: slots.length });
}
