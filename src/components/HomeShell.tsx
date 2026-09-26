'use client';

import Link from 'next/link';
import {
  AppShell,
  Container,
  Title,
  Text,
  Group,
  ThemeIcon,
  Stack,
  Card,
  Button,
  Alert,
  Avatar,
  Menu,
  UnstyledButton,
  Paper,
  Badge,
  Code,
} from '@mantine/core';
import {
  IconCalendarClock,
  IconBrandGoogle,
  IconBrandWindows,
  IconLogout,
  IconChevronDown,
  IconSettings,
  IconInfoCircle,
} from '@tabler/icons-react';
import { DateTime } from 'luxon';
import { signInWith, signOutAction } from '@/app/actions';
import { initials, avatarColor } from '@/lib/avatar';
import { CreateForm } from './CreateForm';

export interface HomeUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export interface HomePoll {
  id: string;
  title: string;
  dateMin: string;
  dateMax: string;
  adminToken: string;
  participantCount: number;
}

const PROVIDER_ICON: Record<string, React.ReactNode> = {
  google: <IconBrandGoogle size={18} />,
  'microsoft-entra-id': <IconBrandWindows size={18} />,
};

function fmtDate(iso: string) {
  return DateTime.fromISO(iso).setLocale('fr').toFormat('d LLL yyyy');
}

export function HomeShell({
  user,
  providers,
  polls,
}: {
  user: HomeUser | null;
  providers: { id: string; name: string }[];
  polls: HomePoll[];
}) {
  const displayName = user?.name || user?.email || 'Mon compte';

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Container size="md" h="100%">
          <Group h="100%" justify="space-between">
            <Group gap="xs">
              <ThemeIcon variant="light" size="md" radius="md">
                <IconCalendarClock size={18} />
              </ThemeIcon>
              <Text fw={650}>LogiMeet</Text>
            </Group>

            {user && (
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <UnstyledButton>
                    <Group gap={8}>
                      <Avatar
                        src={user.image}
                        radius="xl"
                        size="sm"
                        color={avatarColor(user.id)}
                      >
                        {initials(displayName)}
                      </Avatar>
                      <Text size="sm" fw={500} visibleFrom="xs">
                        {displayName}
                      </Text>
                      <IconChevronDown size={14} />
                    </Group>
                  </UnstyledButton>
                </Menu.Target>
                <Menu.Dropdown>
                  {user.email && <Menu.Label>{user.email}</Menu.Label>}
                  <form action={signOutAction}>
                    <Menu.Item
                      component="button"
                      type="submit"
                      color="red"
                      leftSection={<IconLogout size={14} />}
                    >
                      Se déconnecter
                    </Menu.Item>
                  </form>
                </Menu.Dropdown>
              </Menu>
            )}
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

            {!user ? (
              <Card withBorder padding="lg" radius="md" maw={420}>
                <Stack gap="md">
                  <div>
                    <Text fw={600}>Connexion</Text>
                    <Text size="sm" c="dimmed">
                      Un compte est nécessaire pour créer un sondage. Les participants
                      invités par lien n&apos;ont pas besoin de compte.
                    </Text>
                  </div>
                  {providers.length === 0 ? (
                    <Alert
                      color="yellow"
                      variant="light"
                      icon={<IconInfoCircle size={16} />}
                      style={{ overflowWrap: 'anywhere' }}
                    >
                      Aucun fournisseur de connexion n&apos;est configuré. Renseignez{' '}
                      <Code>AUTH_GOOGLE_ID</Code> / <Code>AUTH_GOOGLE_SECRET</Code> ou{' '}
                      <Code>AUTH_MICROSOFT_ENTRA_ID_ID</Code> /{' '}
                      <Code>AUTH_MICROSOFT_ENTRA_ID_SECRET</Code> dans le <Code>.env</Code>.
                    </Alert>
                  ) : (
                    providers.map((p) => (
                      <form key={p.id} action={signInWith.bind(null, p.id)}>
                        <Button
                          type="submit"
                          fullWidth
                          variant="default"
                          size="md"
                          leftSection={PROVIDER_ICON[p.id]}
                        >
                          Continuer avec {p.name}
                        </Button>
                      </form>
                    ))
                  )}
                </Stack>
              </Card>
            ) : (
              <>
                {polls.length > 0 && (
                  <Stack gap="sm">
                    <Title order={3}>Mes sondages</Title>
                    {polls.map((p) => (
                      <Paper key={p.id} withBorder p="md" radius="md">
                        <Group justify="space-between" wrap="nowrap">
                          <div style={{ minWidth: 0 }}>
                            <Text fw={600} truncate>
                              {p.title}
                            </Text>
                            <Group gap="xs" mt={4}>
                              <Text size="sm" c="dimmed">
                                {fmtDate(p.dateMin)} - {fmtDate(p.dateMax)}
                              </Text>
                              <Badge variant="light" size="sm">
                                {p.participantCount} participant
                                {p.participantCount > 1 ? 's' : ''}
                              </Badge>
                            </Group>
                          </div>
                          <Button
                            component={Link}
                            href={`/admin/${p.adminToken}`}
                            variant="light"
                            leftSection={<IconSettings size={16} />}
                            style={{ flexShrink: 0 }}
                          >
                            Gérer
                          </Button>
                        </Group>
                      </Paper>
                    ))}
                  </Stack>
                )}

                <Stack gap="sm">
                  <Title order={3}>Nouveau sondage</Title>
                  <CreateForm />
                </Stack>
              </>
            )}
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
