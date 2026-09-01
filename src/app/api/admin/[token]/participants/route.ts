import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

async function pollIdForAdmin(token: string): Promise<string | null> {
  const poll = await prisma.poll.findUnique({
    where: { adminToken: token },
    select: { id: true },
  });
  return poll?.id ?? null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const pollId = await pollIdForAdmin(token);
  if (!pollId) {
    return NextResponse.json({ error: 'Sondage introuvable.' }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'JSON invalide.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 100) {
    return NextResponse.json({ error: 'Nom invalide.' }, { status: 400 });
  }

  const participant = await prisma.participant.create({
    data: { name, pollId },
    select: { id: true, name: true, token: true },
  });
  return NextResponse.json({ ...participant, slotCount: 0 }, { status: 201 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const pollId = await pollIdForAdmin(token);
  if (!pollId) {
    return NextResponse.json({ error: 'Sondage introuvable.' }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'JSON invalide.' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!id) {
    return NextResponse.json({ error: 'Identifiant manquant.' }, { status: 400 });
  }
  if (!name || name.length > 100) {
    return NextResponse.json({ error: 'Nom invalide.' }, { status: 400 });
  }

  // Scope the update to this poll so an admin token can't touch other polls.
  const result = await prisma.participant.updateMany({
    where: { id, pollId },
    data: { name },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: 'Participant introuvable.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const pollId = await pollIdForAdmin(token);
  if (!pollId) {
    return NextResponse.json({ error: 'Sondage introuvable.' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Identifiant manquant.' }, { status: 400 });
  }

  // Scope the delete to this poll so an admin token can't touch other polls.
  const result = await prisma.participant.deleteMany({
    where: { id, pollId },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: 'Participant introuvable.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
