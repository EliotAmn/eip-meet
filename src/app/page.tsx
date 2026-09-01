'use client';

import {
  AppShell,
  Container,
  Title,
  Text,
  Group,
  ThemeIcon,
  Stack,
} from '@mantine/core';
import { IconCalendarClock } from '@tabler/icons-react';
import { CreateForm } from '@/components/CreateForm';

export default function HomePage() {
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Container size="md" h="100%">
          <Group h="100%" gap="xs">
            <ThemeIcon variant="light" size="md" radius="md">
              <IconCalendarClock size={18} />
            </ThemeIcon>
            <Text fw={650}>LogiMeet</Text>
          </Group>
        </Container>
      </AppShell.Header>

      <AppShell.Main>
        <Container size="md" py="xl">
          <Stack gap="xl">
            <Stack gap="xs">
              <Title order={1}>Trouver un créneau qui va à tout le monde</Title>
              <Text c="dimmed" size="lg">
                Créez un sondage, partagez un lien à chaque participant, et laissez
                chacun peindre ses disponibilités. Les fuseaux horaires sont gérés
                automatiquement.
              </Text>
            </Stack>
            <CreateForm />
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
