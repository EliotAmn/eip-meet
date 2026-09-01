import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/;

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

  // Replace the participant's availability atomically.
  await prisma.$transaction([
    prisma.slot.deleteMany({ where: { participantId: me.id } }),
    prisma.slot.createMany({
      data: slots.map((startUtc) => ({ participantId: me.id, startUtc })),
    }),
  ]);

  return NextResponse.json({ ok: true, count: slots.length });
}
