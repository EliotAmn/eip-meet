import { Card, Stack, Text, Title } from '@mantine/core';
import { MeetingForm } from '@/components/MeetingForm';
import { currentUser } from '@/lib/server';

export default async function NewMeetingPage() {
  const user = await currentUser();
  if (!user) return null;
  return (
    <Stack gap="lg" maw={640}>
      <div>
        <Title order={2}>Nouvelle réunion</Title>
        <Text c="dimmed">
          Définissez la période pendant laquelle la réunion doit avoir lieu, puis invitez les
          participants.
        </Text>
      </div>
      <Card withBorder radius="md" padding="lg">
        <MeetingForm meEmail={user.email} />
      </Card>
    </Stack>
  );
}
