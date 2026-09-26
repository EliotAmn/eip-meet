import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser, meetingsForUser } from '@/lib/server';
import { validateCreateMeeting, ValidationError } from '@/lib/validate';
import { newGuestToken } from '@/lib/tokens';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  return NextResponse.json(await meetingsForUser(user));
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  try {
    const input = validateCreateMeeting(await request.json().catch(() => null));
    const ownerEmail = user.email?.toLowerCase() ?? null;
    const invited = input.memberEmails.filter((e) => e !== ownerEmail);
    const known = await prisma.user.findMany({
      where: { email: { in: invited } },
      select: { id: true, email: true },
    });
    const idByEmail = new Map(known.map((u) => [u.email!.toLowerCase(), u.id]));

    const meeting = await prisma.meeting.create({
      data: {
        title: input.title,
        dateMin: input.dateMin,
        dateMax: input.dateMax,
        granularity: input.granularity,
        dayStart: input.dayStart,
        dayEnd: input.dayEnd,
        ownerId: user.id,
        members: {
          create: [
            ...(ownerEmail ? [{ email: ownerEmail, userId: user.id, role: 'admin' }] : []),
            ...invited.map((email) => ({
              email,
              userId: idByEmail.get(email) ?? null,
              role: 'member',
            })),
          ],
        },
        guests: { create: input.guestNames.map((name) => ({ name, token: newGuestToken() })) },
      },
      select: { id: true },
    });
    return NextResponse.json({ id: meeting.id }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
