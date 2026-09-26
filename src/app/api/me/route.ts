import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/server';
import { isValidTimezone } from '@/lib/validate';

const unauthorized = () =>
  NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id, name, email, image, timezone } = user;
  return NextResponse.json({ id, name, email, image, timezone });
}

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => null)) as { timezone?: unknown } | null;
  if (!isValidTimezone(body?.timezone)) {
    return NextResponse.json({ error: 'Fuseau horaire invalide.' }, { status: 400 });
  }
  await prisma.user.update({ where: { id: user.id }, data: { timezone: body.timezone } });
  return NextResponse.json({ ok: true, timezone: body.timezone });
}
