'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Affix,
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Center,
  Container,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Tabs,
  Text,
  ThemeIcon,
  Title,
  Transition,
  rem,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCalendarClock,
  IconCalendarEvent,
  IconClock,
  IconDeviceFloppy,
  IconListCheck,
  IconWorld,
} from '@tabler/icons-react';
import { apiFetch } from '@/lib/api';
import { avatarColor, initials } from '@/lib/avatar';
import { buildAvailability, meetingSlotKeys, startStatuses } from '@/lib/availability';
import { detectTimezone, formatDuration, offsetLabel } from '@/lib/time';
import { supportedTimezones } from '@/lib/timezones';
import type { MeetingDetail, SlotStatus } from '@/lib/types';
import { AvailabilityGrid, type PaintMode } from './AvailabilityGrid';
import { MeetingResults } from './MeetingResults';
import { StripeLegend } from './StripeLegend';
import { periodLabel } from './MeetingView';
import { APP_NAME } from '@/lib/brand';

const GRAN_LABEL: Record<number, string> = { 15: '15 min', 30: '30 min', 60: '1 heure' };

function sameSlots(a: Map<string, SlotStatus>, b: Map<string, SlotStatus>) {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

export function GuestView({ token }: { token: string }) {
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tz, setTz] = useState('UTC');
  const [mySlots, setMySlots] = useState<Map<string, SlotStatus>>(new Map());
  const [saved, setSaved] = useState<Map<string, SlotStatus>>(new Map());
  const [paintMode, setPaintMode] = useState<PaintMode>('yes');
  const [saving, setSaving] = useState(false);

  useEffect(() => setTz(detectTimezone()), []);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<MeetingDetail>(`/api/g/${token}`);
      setDetail(d);
      const guestId = d.viewer.kind === 'guest' ? d.viewer.guestId : null;
      const me = d.guests.find((g) => g.id === guestId);
      const map = new Map((me?.slots ?? []).map((s) => [s.start, s.status] as const));
      setMySlots(map);
      setSaved(new Map(map));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    }
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  const dirty = !sameSlots(mySlots, saved);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const keys = useMemo(() => (detail ? meetingSlotKeys(detail.meeting, tz) : []), [detail, tz]);
  const { participants, statuses } = useMemo(
    () =>
      detail ? buildAvailability(detail, tz, keys, mySlots) : { participants: [], statuses: new Map() },
    [detail, tz, keys, mySlots],
  );
  // Who can attend a meeting of the full duration, per possible start time.
  const starts = useMemo(
    () =>
      detail
        ? startStatuses(keys, statuses, detail.meeting.granularity, detail.meeting.duration)
        : new Map(),
    [detail, keys, statuses],
  );

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/api/g/${token}`, {
        method: 'PUT',
        body: JSON.stringify({
          slots: Array.from(mySlots, ([start, status]) => ({ start, status })),
          timezone: tz,
        }),
      });
      setSaved(new Map(mySlots));
      notifications.show({ color: 'teal', message: 'Disponibilités enregistrées.' });
    } catch (err) {
      notifications.show({ color: 'red', message: err instanceof Error ? err.message : 'Erreur.' });
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <Container size="sm" py="xl">
        <Alert color="red" title="Lien invalide">
          {error}
        </Alert>
      </Container>
    );
  }
  if (!detail) {
    return (
      <Center h="60vh">
        <Loader />
      </Center>
    );
  }

  const { meeting, viewer } = detail;
  const myName = viewer.kind === 'guest' ? viewer.name : '';
  const myFill = (key: string) => {
    const s = mySlots.get(key);
    if (s === 'yes') return 'var(--mantine-color-indigo-6)';
    if (s === 'if_needed') return 'var(--mantine-color-yellow-5)';
    return null;
  };

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group gap="xs">
          <ThemeIcon variant="light" size="md" radius="md">
            <IconCalendarClock size={18} />
          </ThemeIcon>
          <Text fw={650}>{APP_NAME}</Text>
        </Group>
        <div>
          <Title order={2}>{meeting.title}</Title>
          <Text c="dimmed" mt={2}>
            {periodLabel(meeting.dateMin, meeting.dateMax)} · réunion de {formatDuration(meeting.duration)}
          </Text>
          <Text mt="xs">
            Bonjour <b>{myName}</b> - peignez vos disponibilités ci-dessous puis enregistrez.
          </Text>
        </div>

        <Card withBorder radius="md" padding="md">
          <Group justify="space-between" wrap="wrap" gap="md">
            <Group gap="xs">
              <IconWorld size={18} />
              <Text size="sm" fw={500}>
                Fuseau horaire :
              </Text>
              <Select
                data={supportedTimezones()}
                value={tz}
                onChange={(v) => v && setTz(v)}
                searchable
                allowDeselect={false}
                w={240}
                size="xs"
                comboboxProps={{ withinPortal: true }}
              />
              <Badge variant="light" leftSection={<IconClock size={12} />}>
                {offsetLabel(tz)}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed">
              Heures affichées dans votre fuseau ; converties automatiquement pour les autres.
            </Text>
          </Group>
        </Card>

        <Card withBorder radius="md" padding="md">
          <Text fw={600} mb="sm">
            Participants
          </Text>
          <Group gap="lg">
            {participants.map((p) => (
              <Group key={p.id} gap={8} wrap="nowrap">
                <Avatar src={p.image} radius="xl" color={avatarColor(p.id)}>
                  {initials(p.name)}
                </Avatar>
                <div>
                  <Text size="sm" fw={500}>
                    {p.name}
                    {p.isMe ? ' (vous)' : ''}
                  </Text>
                  <Badge size="xs" variant="light" color={p.answered ? 'teal' : 'gray'}>
                    {p.answered ? (p.kind === 'member' ? 'calendrier renseigné' : 'a répondu') : 'en attente'}
                  </Badge>
                </div>
              </Group>
            ))}
          </Group>
        </Card>

        <Tabs defaultValue="me" keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="me" leftSection={<IconCalendarEvent size={16} />}>
              Mes disponibilités
            </Tabs.Tab>
            <Tabs.Tab value="results" leftSection={<IconListCheck size={16} />}>
              Créneaux possibles
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="me" pt="md">
            <Stack gap="sm">
              <Group justify="space-between" wrap="wrap" gap="sm">
                <SegmentedControl
                  size="xs"
                  value={paintMode}
                  onChange={(v) => setPaintMode(v as PaintMode)}
                  data={[
                    { value: 'yes', label: 'Dispo' },
                    { value: 'if_needed', label: 'Si besoin' },
                    { value: 'erase', label: 'Effacer' },
                  ]}
                />
                <Text size="xs" c="dimmed">
                  Cliquez-glissez pour peindre vos dispos. Réunion de {formatDuration(meeting.duration)}, créneaux de {GRAN_LABEL[meeting.granularity]}.
                </Text>
              </Group>
              <StripeLegend />
              <AvailabilityGrid
                meeting={meeting}
                tz={tz}
                participants={participants}
                statuses={starts}
                myFill={myFill}
                editable
                mySlots={mySlots}
                onChange={setMySlots}
                paintMode={paintMode}
              />
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="results" pt="md">
            <MeetingResults
              keys={keys}
              statuses={starts}
              participants={participants}
              granularity={meeting.granularity}
              duration={meeting.duration}
              tz={tz}
            />
          </Tabs.Panel>
        </Tabs>
      </Stack>

      <Affix position={{ bottom: rem(20), right: rem(20) }}>
        <Transition transition="slide-up" mounted={dirty}>
          {(styles) => (
            <Paper style={styles} withBorder shadow="md" p="sm" radius="md">
              <Group gap="sm">
                <Text size="sm">Modifications non enregistrées</Text>
                <Button size="sm" loading={saving} onClick={save} leftSection={<IconDeviceFloppy size={16} />}>
                  Enregistrer
                </Button>
              </Group>
            </Paper>
          )}
        </Transition>
      </Affix>
    </Container>
  );
}
