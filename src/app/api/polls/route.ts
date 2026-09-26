import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { validateCreatePoll, ValidationError } from '@/lib/validate';

export async function POST(request: Request) {
  // Creating a poll requires an account.
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) {
    return NextResponse.json(
      { error: 'Connectez-vous pour créer un sondage.' },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide.' }, { status: 400 });
  }

  try {
    const input = validateCreatePoll(body);
    const poll = await prisma.poll.create({
      data: {
        title: input.title,
        dateMin: input.dateMin,
        dateMax: input.dateMax,
        granularity: input.granularity,
        dayStart: input.dayStart,
        dayEnd: input.dayEnd,
        ownerId,
        participants: {
          create: input.participants.map((name) => ({ name })),
        },
      },
      select: { adminToken: true },
    });
    return NextResponse.json({ adminToken: poll.adminToken }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('POST /api/polls', err);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
