import type { Metadata } from 'next';
import { AdminView } from '@/components/AdminView';

// The admin URL is secret; keep it out of search engines and link previews.
export const metadata: Metadata = {
  title: 'Administration - LogiMeet',
  robots: { index: false, follow: false },
};

export default async function AdminPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <AdminView token={token} />;
}
