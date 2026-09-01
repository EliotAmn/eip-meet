'use client';

import { useParams } from 'next/navigation';
import { AdminView } from '@/components/AdminView';

export default function AdminPage() {
  const params = useParams<{ token: string }>();
  return <AdminView token={params.token} />;
}
