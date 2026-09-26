import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/server';

// Accounts of this (private, team) instance, to suggest when inviting people.
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  const users = await prisma.user.findMany({
    where: { email: { not: null } },
    select: { name: true, email: true, image: true },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json(users);
}
