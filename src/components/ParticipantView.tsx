'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Container,
  Title,
  Text,
  Stack,
  Group,
  Select,
  Tabs,
  Card,
  Loader,
  Center,
  Alert,
  Badge,
  Button,
  Affix,
  Transition,
  Paper,
  Avatar,
  rem,
} from '@mantine/core';
import {
  IconClock,
  IconCalendarEvent,
  IconListCheck,
  IconDeviceFloppy,
  IconWorld,
  IconCheck,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { apiFetch } from '@/lib/api';
import type { ParticipantPageData } from '@/lib/types';
import { detectTimezone, offsetLabel } from '@/lib/time';
import { supportedTimezones } from '@/lib/timezones';
import { initials, avatarColor } from '@/lib/avatar';
import { WeekCalendar } from './WeekCalendar';
import { ResultsList } from './ResultsList';

const GRAN_LABEL: Record<number, string> = { 15: '15 min', 30: '30 min', 60: '1 heure' };

export function ParticipantView({ token }: { token: string }) {
  const [data, setData] = useState<ParticipantPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tz, setTz] = useState<string>('UTC');
  const [mySlots, setMySlots] = useState<Set<string>>(new Set());
  const [savedSlots, setSavedSlots] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTz(detectTimezone());
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<ParticipantPageData>(`/api/p/${token}`);
      setData(d);
      const mine = d.participants.find((p) => p.id === d.me.id);
      const set = new Set(mine?.slots ?? []);
      setMySlots(set);
      setSavedSlots(new Set(set));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => {
    if (mySlots.size !== savedSlots.size) return true;
    for (const s of mySlots) if (!savedSlots.has(s)) return true;
    return false;
  }, [mySlots, savedSlots]);

  // Warn before leaving with unsaved changes.
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

  // Slot key -> set of *other* participant ids available (my own live status
  // comes from mySlots so it updates as I paint).
  const othersSlots = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (!data) return map;
    for (const p of data.participants) {
      if (p.id === data.me.id) continue;
      for (const s of p.slots) {
        let set = map.get(s);
        if (!set) {
          set = new Set();
          map.set(s, set);
        }
        set.add(p.id);
      }
    }
    return map;
  }, [data]);

  const calParticipants = useMemo(
    () => (data ? data.participants.map((p) => ({ id: p.id, name: p.name })) : []),
    [data],
  );

  // Roster + who has answered. My own row reflects my live (unsaved) selection.
  const roster = useMemo(() => {
    if (!data) return [];
    return data.participants.map((p) => ({
      id: p.id,
      name: p.name,
      isMe: p.id === data.me.id,
      responded: p.id === data.me.id ? mySlots.size > 0 : p.slots.length > 0,
    }));
  }, [data, mySlots]);

  const respondedCount = roster.filter((r) => r.responded).length;

  // Participant list with my *current* (possibly unsaved) selection applied,
  // so the results tab reflects what I'm painting live.
  const participantsForResults = useMemo(() => {
    if (!data) return [];
    return data.participants.map((p) =>
      p.id === data.me.id ? { ...p, slots: Array.from(mySlots) } : p,
    );
  }, [data, mySlots]);

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/api/p/${token}/availability`, {
        method: 'PUT',
        body: JSON.stringify({ slots: Array.from(mySlots) }),
      });
      setSavedSlots(new Set(mySlots));
      notifications.show({ color: 'teal', message: 'Disponibilités enregistrées.' });
    } catch (err) {
      notifications.show({
        color: 'red',
        message: err instanceof Error ? err.message : 'Erreur.',
      });
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <Container size="lg" py="xl">
        <Alert color="red" title="Oups">
          {error}
        </Alert>
      </Container>
    );
  }

  if (!data) {
    return (
      <Center h="60vh">
        <Loader />
      </Center>
    );
  }

  const { poll, me } = data;
  const tzOptions = supportedTimezones();

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <div>
          <Group gap="xs" mb={4}>
            <IconCalendarEvent size={18} />
            <Text size="sm" c="dimmed" tt="uppercase" fw={600}>
              Sondage de disponibilités
            </Text>
          </Group>
          <Title order={1}>{poll.title}</Title>
          <Text c="dimmed" mt={4}>
            Bonjour <b>{me.name}</b> - peignez vos créneaux disponibles ci-dessous.
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
                data={tzOptions}
                value={tz}
                onChange={(v) => v && setTz(v)}
                searchable
                allowDeselect={false}
                w={260}
                size="xs"
                comboboxProps={{ withinPortal: true }}
              />
              <Badge variant="light" leftSection={<IconClock size={12} />}>
                {offsetLabel(tz)}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed">
              Les heures affichées sont dans votre fuseau. Vos dispos sont converties
              automatiquement pour les autres.
            </Text>
          </Group>
        </Card>

        <Card withBorder radius="md" padding="md">
          <Group justify="space-between" mb="sm">
            <Text fw={600}>Participants</Text>
            <Badge variant="light" color={respondedCount === roster.length ? 'teal' : 'gray'}>
              {respondedCount}/{roster.length} ont répondu
            </Badge>
          </Group>
          <Group gap="lg">
            {roster.map((r) => (
              <Group key={r.id} gap={8} wrap="nowrap">
                <Avatar color={avatarColor(r.id)} radius="xl" size="md">
                  {initials(r.name)}
                </Avatar>
                <div>
                  <Text size="sm" fw={500} lineClamp={1}>
                    {r.name}
                    {r.isMe ? ' (vous)' : ''}
                  </Text>
                  {r.responded ? (
                    <Badge
                      size="xs"
                      color="teal"
                      variant="light"
                      leftSection={<IconCheck size={10} />}
                    >
                      a répondu
                    </Badge>
                  ) : (
                    <Badge size="xs" color="gray" variant="light">
                      en attente
                    </Badge>
                  )}
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
              Résultats
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="me" pt="md">
            <Stack gap="sm">
              <Group gap="xs">
                <Badge variant="dot" color="indigo">
                  Vos dispos
                </Badge>
                <Badge variant="dot" color="green">
                  Tout le monde dispo
                </Badge>
                <Text size="xs" c="dimmed">
                  Carrés à droite : un par personne, vert = dispo, rouge = indispo
                  (survolez pour le nom). Créneaux de {GRAN_LABEL[poll.granularity]}.
                  Cliquez-glissez pour peindre.
                </Text>
              </Group>
              <WeekCalendar
                poll={poll}
                tz={tz}
                mySlots={mySlots}
                onChange={setMySlots}
                participants={calParticipants}
                meId={me.id}
                othersSlots={othersSlots}
              />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="results" pt="md">
            <ResultsList
              participants={participantsForResults}
              granularity={poll.granularity}
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
                <Button
                  size="sm"
                  loading={saving}
                  onClick={save}
                  leftSection={<IconDeviceFloppy size={16} />}
                >
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
