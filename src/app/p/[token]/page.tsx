'use client';

import { useParams } from 'next/navigation';
import { ParticipantView } from '@/components/ParticipantView';

export default function ParticipantPage() {
  const params = useParams<{ token: string }>();
  return <ParticipantView token={params.token} />;
}
