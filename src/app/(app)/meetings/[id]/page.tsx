import { MeetingView } from '@/components/MeetingView';
import { currentUser } from '@/lib/server';

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return null;
  return <MeetingView id={id} tz={user.timezone ?? 'UTC'} meEmail={user.email} />;
}
