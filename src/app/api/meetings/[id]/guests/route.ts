import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser, meetingAccess } from '@/lib/server';
import { newGuestToken } from '@/lib/tokens';

type Ctx = { params: Promise<{ id: string }> };

async function adminAccess(ctx: Ctx) {
  const { id } = await ctx.params;
  const user = await currentUser();
  if (!user) return { error: NextResponse.json({ error: 'Connexion requise.' }, { status: 401 }) };
  const acc = await meetingAccess(id, user);
  if (!acc) return { error: NextResponse.json({ error: 'Réunion introuvable.' }, { status: 404 }) };
  if (!acc.isAdmin) return { error: NextResponse.json({ error: 'Réservé aux admins.' }, { status: 403 }) };
  return { id };
}

const cleanName = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const badName = () => NextResponse.json({ error: 'Nom invalide.' }, { status: 400 });

/** Add a guest (someone answering through a personal link, no account). */
export async function POST(request: Request, ctx: Ctx) {
  const a = await adminAccess(ctx);
  if ('error' in a) return a.error;
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = cleanName(body?.name);
  if (!name || name.length > 100) return badName();
  const guest = await prisma.guest.create({
    data: { meetingId: a.id, name, token: newGuestToken() },
    select: { id: true, token: true },
  });
  return NextResponse.json(guest, { status: 201 });
}

/** Rename a guest. */
export async function PATCH(request: Request, ctx: Ctx) {
  const a = await adminAccess(ctx);
  if ('error' in a) return a.error;
  const body = (await request.json().catch(() => null)) as { id?: unknown; name?: unknown } | null;
  const name = cleanName(body?.name);
  if (!name || name.length > 100 || typeof body?.id !== 'string') return badName();
  const res = await prisma.guest.updateMany({ where: { id: body.id, meetingId: a.id }, data: { name } });
  if (res.count === 0) return NextResponse.json({ error: 'Invité introuvable.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const a = await adminAccess(ctx);
  if ('error' in a) return a.error;
  const guestId = new URL(request.url).searchParams.get('id') ?? '';
  const res = await prisma.guest.deleteMany({ where: { id: guestId, meetingId: a.id } });
  if (res.count === 0) return NextResponse.json({ error: 'Invité introuvable.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
