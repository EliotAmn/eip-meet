import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildMeetingDetail, currentUser, meetingAccess } from '@/lib/server';
import { validateMeeting, ValidationError } from '@/lib/validate';

type Ctx = { params: Promise<{ id: string }> };

async function access(ctx: Ctx) {
  const { id } = await ctx.params;
  const user = await currentUser();
  if (!user) return { error: NextResponse.json({ error: 'Connexion requise.' }, { status: 401 }) };
  const acc = await meetingAccess(id, user);
  if (!acc) return { error: NextResponse.json({ error: 'Réunion introuvable.' }, { status: 404 }) };
  return { id, user, ...acc };
}

export async function GET(_request: Request, ctx: Ctx) {
  const a = await access(ctx);
  if ('error' in a) return a.error;
  const detail = await buildMeetingDetail(
    a.id,
    { kind: 'member', memberId: a.member?.id ?? null, role: a.role, isAdmin: a.isAdmin },
    { includeEmails: true, includeTokens: a.isAdmin },
  );
  return NextResponse.json(detail);
}

export async function PATCH(request: Request, ctx: Ctx) {
  const a = await access(ctx);
  if ('error' in a) return a.error;
  if (!a.isAdmin) return NextResponse.json({ error: 'Réservé aux admins.' }, { status: 403 });
  try {
    const input = validateMeeting(await request.json().catch(() => null));
    await prisma.meeting.update({ where: { id: a.id }, data: input });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const a = await access(ctx);
  if ('error' in a) return a.error;
  if (a.role !== 'owner') {
    return NextResponse.json({ error: 'Seul le créateur peut supprimer la réunion.' }, { status: 403 });
  }
  await prisma.meeting.delete({ where: { id: a.id } });
  return NextResponse.json({ ok: true });
}
