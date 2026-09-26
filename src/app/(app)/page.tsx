import { PersonalCalendar } from '@/components/PersonalCalendar';
import { currentUser, meetingsForUser } from '@/lib/server';

export default async function CalendarPage() {
  const user = await currentUser();
  if (!user) return null; // the layout shows the login page
  const meetings = await meetingsForUser(user);
  return <PersonalCalendar timezone={user.timezone} meetings={meetings} />;
}
