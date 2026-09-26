import { auth, enabledProviders } from '@/auth';
import { prisma } from '@/lib/prisma';
import { HomeShell, type HomePoll, type HomeUser } from '@/components/HomeShell';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const session = await auth();
  const sessionUser = session?.user;

  let user: HomeUser | null = null;
  let polls: HomePoll[] = [];

  if (sessionUser?.id) {
    user = {
      id: sessionUser.id,
      name: sessionUser.name ?? null,
      email: sessionUser.email ?? null,
      image: sessionUser.image ?? null,
    };
    const rows = await prisma.poll.findMany({
      where: { ownerId: sessionUser.id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { participants: true } } },
    });
    polls = rows.map((p) => ({
      id: p.id,
      title: p.title,
      dateMin: p.dateMin,
      dateMax: p.dateMax,
      adminToken: p.adminToken,
      participantCount: p._count.participants,
    }));
  }

  return (
    <HomeShell
      user={user}
      providers={enabledProviders}
      polls={polls}
      authError={user ? null : (error ?? null)}
    />
  );
}
