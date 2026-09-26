import { enabledProviders } from '@/auth';
import { AppFrame } from '@/components/AppFrame';
import { Landing } from '@/components/Landing';
import { currentUser, meetingsForUser } from '@/lib/server';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) return <Landing providers={enabledProviders} />;

  const meetings = await meetingsForUser(user);
  return (
    <AppFrame
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        timezone: user.timezone,
      }}
      meetings={meetings}
    >
      {children}
    </AppFrame>
  );
}
