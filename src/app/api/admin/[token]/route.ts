import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { AdminPageData } from '@/lib/types';
import { validatePollSettings, ValidationError } from '@/lib/validate';

async function loadAdmin(token: string): Promise<AdminPageData | null> {
  const poll = await prisma.poll.findUnique({
    where: { adminToken: token },
    include: {
      participants: {
        orderBy: { createdAt: 'asc' },
        include: { _count: { select: { slots: true } } },
      },
    },
  });
  if (!poll) return null;
  return {
    poll: {
      id: poll.id,
      title: poll.title,
      dateMin: poll.dateMin,
      dateMax: poll.dateMax,
      granularity: poll.granularity,
      dayStart: poll.dayStart,
      dayEnd: poll.dayEnd,
    },
    participants: poll.participants.map((p) => ({
      id: p.id,
      name: p.name,
      token: p.token,
      slotCount: p._count.slots,
    })),
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const data = await loadAdmin(token);
  if (!data) {
    return NextResponse.json({ error: 'Sondage introuvable.' }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const poll = await prisma.poll.findUnique({ where: { adminToken: token } });
  if (!poll) {
    return NextResponse.json({ error: 'Sondage introuvable.' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide.' }, { status: 400 });
  }

  try {
    const settings = validatePollSettings(body);
    await prisma.poll.update({
      where: { id: poll.id },
      data: settings,
    });
    const data = await loadAdmin(token);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('PATCH /api/admin/[token]', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
