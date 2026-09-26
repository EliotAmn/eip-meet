'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AppShell,
  Avatar,
  Badge,
  Burger,
  Button,
  Group,
  Menu,
  Modal,
  NavLink,
  ScrollArea,
  Select,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconCalendarClock,
  IconCalendarUser,
  IconChevronDown,
  IconLogout,
  IconPlus,
  IconWorld,
} from '@tabler/icons-react';
import { DateTime } from 'luxon';
import { signOutAction } from '@/app/actions';
import { apiFetch } from '@/lib/api';
import { initials, avatarColor } from '@/lib/avatar';
import { detectTimezone, offsetLabel } from '@/lib/time';
import { supportedTimezones } from '@/lib/timezones';
import type { MeetingSummary } from '@/lib/types';

export interface FrameUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  timezone: string | null;
}

function period(m: MeetingSummary) {
  const a = DateTime.fromISO(m.dateMin).setLocale('fr');
  const b = DateTime.fromISO(m.dateMax).setLocale('fr');
  return m.dateMin === m.dateMax
    ? a.toFormat('d LLL yyyy')
    : `${a.toFormat('d LLL')} - ${b.toFormat('d LLL yyyy')}`;
}

export function AppFrame({
  user,
  meetings,
  children,
}: {
  user: FrameUser;
  meetings: MeetingSummary[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [navOpened, { toggle: toggleNav, close: closeNav }] = useDisclosure();
  const [settingsOpened, settings] = useDisclosure();
  const [tz, setTz] = useState(user.timezone ?? '');
  const displayName = user.name || user.email || 'Mon compte';

  // First visit: store the browser timezone as the account's timezone.
  useEffect(() => {
    if (user.timezone) return;
    apiFetch('/api/me', { method: 'PATCH', body: JSON.stringify({ timezone: detectTimezone() }) })
      .then(() => router.refresh())
      .catch(() => {});
  }, [user.timezone, router]);

  useEffect(() => closeNav(), [pathname, closeNav]);

  async function saveTimezone() {
    try {
      await apiFetch('/api/me', { method: 'PATCH', body: JSON.stringify({ timezone: tz }) });
      settings.close();
      router.refresh();
      notifications.show({ color: 'teal', message: 'Fuseau horaire enregistré.' });
    } catch (err) {
      notifications.show({ color: 'red', message: err instanceof Error ? err.message : 'Erreur.' });
    }
  }

  const today = DateTime.now().toISODate()!;
  const upcoming = meetings.filter((m) => m.dateMax >= today);
  const past = meetings.filter((m) => m.dateMax < today);

  const meetingLink = (m: MeetingSummary) => (
    <NavLink
      key={m.id}
      component={Link}
      href={`/meetings/${m.id}`}
      active={pathname === `/meetings/${m.id}`}
      label={<Text size="sm" truncate>{m.title}</Text>}
      description={period(m)}
      rightSection={
        m.role !== 'member' ? (
          <Badge size="xs" variant="light">
            {m.role === 'owner' ? 'Créateur' : 'Admin'}
          </Badge>
        ) : null
      }
    />
  );

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 290, breakpoint: 'sm', collapsed: { mobile: !navOpened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <Burger opened={navOpened} onClick={toggleNav} hiddenFrom="sm" size="sm" />
            <ThemeIcon variant="light" size="md" radius="md">
              <IconCalendarClock size={18} />
            </ThemeIcon>
            <Text fw={650}>LogiMeet</Text>
          </Group>

          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <UnstyledButton>
                <Group gap={8}>
                  <Avatar src={user.image} radius="xl" size="sm" color={avatarColor(user.id)}>
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
              <Menu.Item leftSection={<IconWorld size={14} />} onClick={settings.open}>
                Fuseau : {user.timezone ?? '…'}
              </Menu.Item>
              <Menu.Divider />
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
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <Button
          component={Link}
          href="/meetings/new"
          leftSection={<IconPlus size={16} />}
          fullWidth
          mb="sm"
        >
          Nouvelle réunion
        </Button>
        <NavLink
          component={Link}
          href="/"
          active={pathname === '/'}
          label="Mon calendrier"
          description="Mes indisponibilités"
          leftSection={<IconCalendarUser size={18} />}
          mb="sm"
        />
        <ScrollArea style={{ flex: 1 }}>
          <Stack gap={0}>
            <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" mb={4}>
              Réunions
            </Text>
            {upcoming.length === 0 && (
              <Text size="sm" c="dimmed" px="sm">
                Aucune réunion à venir.
              </Text>
            )}
            {upcoming.map(meetingLink)}
            {past.length > 0 && (
              <>
                <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm" mt="md" mb={4}>
                  Passées
                </Text>
                {past.map(meetingLink)}
              </>
            )}
          </Stack>
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>

      <Modal opened={settingsOpened} onClose={settings.close} title="Fuseau horaire" centered>
        <Stack>
          <Text size="sm" c="dimmed">
            Votre calendrier est affiché et saisi dans ce fuseau. Les autres voient vos
            indisponibilités converties dans le leur.
          </Text>
          <Select
            data={supportedTimezones()}
            value={tz}
            onChange={(v) => v && setTz(v)}
            searchable
            allowDeselect={false}
            description={tz ? offsetLabel(tz) : undefined}
            comboboxProps={{ withinPortal: true }}
          />
          <Group justify="space-between">
            <Button variant="subtle" onClick={() => setTz(detectTimezone())}>
              Détecter
            </Button>
            <Button onClick={saveTimezone} disabled={!tz}>
              Enregistrer
            </Button>
          </Group>
        </Stack>
      </Modal>
    </AppShell>
  );
}
