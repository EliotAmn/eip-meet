import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { AdminPageData } from '@/lib/types';

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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'JSON invalide.' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : poll.title;
  if (!title) {
    return NextResponse.json({ error: 'Le titre est requis.' }, { status: 400 });
  }

  await prisma.poll.update({
    where: { id: poll.id },
    data: { title },
  });
  const data = await loadAdmin(token);
  return NextResponse.json(data);
}
