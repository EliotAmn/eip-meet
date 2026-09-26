import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser, toUnavailabilityDTO } from '@/lib/server';
import { validateUnavailability, ValidationError } from '@/lib/validate';
import { unavailabilityData } from './data';

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  const events = await prisma.unavailability.findMany({
    where: { userId: user.id },
    include: { exceptions: true },
    orderBy: { startDate: 'asc' },
  });
  return NextResponse.json(events.map(toUnavailabilityDTO));
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  try {
    const input = validateUnavailability(await request.json().catch(() => null));
    const ev = await prisma.unavailability.create({
      data: { userId: user.id, ...unavailabilityData(input) },
      include: { exceptions: true },
    });
    return NextResponse.json(toUnavailabilityDTO(ev), { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
