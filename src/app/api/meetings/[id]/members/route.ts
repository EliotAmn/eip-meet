import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser, meetingAccess } from '@/lib/server';
import { normalizeEmails, ValidationError } from '@/lib/validate';

type Ctx = { params: Promise<{ id: string }> };

async function adminAccess(ctx: Ctx) {
  const { id } = await ctx.params;
  const user = await currentUser();
  if (!user) return { error: NextResponse.json({ error: 'Connexion requise.' }, { status: 401 }) };
  const acc = await meetingAccess(id, user);
  if (!acc) return { error: NextResponse.json({ error: 'Réunion introuvable.' }, { status: 404 }) };
  if (!acc.isAdmin) return { error: NextResponse.json({ error: 'Réservé aux admins.' }, { status: 403 }) };
  return { id, ...acc };
}

/** Invite accounts by email. */
export async function POST(request: Request, ctx: Ctx) {
  const a = await adminAccess(ctx);
  if ('error' in a) return a.error;
  try {
    const body = (await request.json().catch(() => null)) as { emails?: unknown } | null;
    const emails = normalizeEmails(body?.emails);
    const existing = new Set(a.meeting.members.map((m) => m.email));
    const fresh = emails.filter((e) => !existing.has(e));
    const known = await prisma.user.findMany({
      where: { email: { in: fresh } },
      select: { id: true, email: true },
    });
    const idByEmail = new Map(known.map((u) => [u.email!.toLowerCase(), u.id]));
    await prisma.meetingMember.createMany({
      data: fresh.map((email) => ({
        meetingId: a.id,
        email,
        userId: idByEmail.get(email) ?? null,
        role: 'member',
      })),
    });
    return NextResponse.json({ ok: true, added: fresh.length }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

/** Change a member's role (admin / member). */
export async function PATCH(request: Request, ctx: Ctx) {
  const a = await adminAccess(ctx);
  if ('error' in a) return a.error;
  const body = (await request.json().catch(() => null)) as { id?: unknown; role?: unknown } | null;
  const target = a.meeting.members.find((m) => m.id === body?.id);
  if (!target) return NextResponse.json({ error: 'Membre introuvable.' }, { status: 404 });
  if (target.userId && target.userId === a.meeting.ownerId) {
    return NextResponse.json({ error: 'Le créateur reste admin.' }, { status: 400 });
  }
  const role = body?.role === 'admin' ? 'admin' : 'member';
  await prisma.meetingMember.update({ where: { id: target.id }, data: { role } });
  return NextResponse.json({ ok: true });
}

/** Remove a member (not the owner). */
export async function DELETE(request: Request, ctx: Ctx) {
  const a = await adminAccess(ctx);
  if ('error' in a) return a.error;
  const memberId = new URL(request.url).searchParams.get('id');
  const target = a.meeting.members.find((m) => m.id === memberId);
  if (!target) return NextResponse.json({ error: 'Membre introuvable.' }, { status: 404 });
  if (target.userId && target.userId === a.meeting.ownerId) {
    return NextResponse.json({ error: 'Impossible de retirer le créateur.' }, { status: 400 });
  }
  await prisma.meetingMember.delete({ where: { id: target.id } });
  return NextResponse.json({ ok: true });
}
