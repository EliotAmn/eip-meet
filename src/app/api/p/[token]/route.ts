import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { ParticipantPageData } from '@/lib/types';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const me = await prisma.participant.findUnique({
    where: { token },
    select: { id: true, name: true, pollId: true },
  });
  if (!me) {
    return NextResponse.json({ error: 'Lien invalide.' }, { status: 404 });
  }

  const poll = await prisma.poll.findUnique({
    where: { id: me.pollId },
    include: {
      participants: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          slots: { select: { startUtc: true } },
        },
      },
    },
  });
  if (!poll) {
    return NextResponse.json({ error: 'Sondage introuvable.' }, { status: 404 });
  }

  const data: ParticipantPageData = {
    poll: {
      id: poll.id,
      title: poll.title,
      dateMin: poll.dateMin,
      dateMax: poll.dateMax,
      granularity: poll.granularity,
      dayStart: poll.dayStart,
      dayEnd: poll.dayEnd,
    },
    me: { id: me.id, name: me.name },
    participants: poll.participants.map((p) => ({
      id: p.id,
      name: p.name,
      slots: p.slots.map((s) => s.startUtc),
    })),
  };
  return NextResponse.json(data);
}
