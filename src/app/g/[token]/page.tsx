import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { GuestView } from '@/components/GuestView';
import { APP_NAME } from '@/lib/brand';

// Link previews (Discord, WhatsApp, ...) show the meeting title.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const guest = await prisma.guest.findUnique({
    where: { token },
    select: { meeting: { select: { title: true } } },
  });
  const title = guest?.meeting.title;
  if (!title) return { title: `Lien invalide - ${APP_NAME}` };
  const description = `Indiquez vos disponibilités pour "${title}".`;
  return {
    title: `${title} - ${APP_NAME}`,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, siteName: APP_NAME, type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function GuestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <GuestView token={token} />;
}
