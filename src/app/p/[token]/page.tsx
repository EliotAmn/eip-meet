import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { ParticipantView } from '@/components/ParticipantView';

// Server component so we can expose Open Graph metadata: when the participant
// link is shared (Discord, WhatsApp, ...), the preview shows the poll title.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const participant = await prisma.participant.findUnique({
    where: { token },
    select: { poll: { select: { title: true } } },
  });

  const title = participant?.poll.title;
  if (!title) {
    return { title: 'Sondage introuvable - LogiMeet' };
  }

  const description = `Indiquez vos disponibilités pour "${title}".`;
  return {
    title: `${title} - LogiMeet`,
    description,
    openGraph: {
      title,
      description,
      siteName: 'LogiMeet',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default async function ParticipantPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ParticipantView token={token} />;
}
