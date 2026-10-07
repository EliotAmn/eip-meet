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
import { computeRanges, evaluateMeeting } from '@/lib/availability';
import { detectTimezone, formatDuration, offsetLabel } from '@/lib/time';
import { supportedTimezones } from '@/lib/timezones';
import { GUEST_STEPS, type MeetingDetail } from '@/lib/types';
import { fromIso, toIso, type MsInterval } from '@/lib/intervals';
import { AvailabilityGrid, type MyBlock, type PaintMode } from './AvailabilityGrid';
import { MeetingResults } from './MeetingResults';
import { StripeLegend } from './StripeLegend';
import { periodLabel } from './MeetingView';
import { APP_NAME } from '@/lib/brand';

const STEP_LABEL: Record<number, string> = { 15: '15 min', 30: '30 min', 60: '1h' };

const sameIntervals = (a: MsInterval[], b: MsInterval[]) =>
  a.length === b.length &&
  a.every((x, i) => x.start === b[i].start && x.end === b[i].end && x.status === b[i].status);

// The guest's own painting.
const PAINT = {
  yes: { background: 'var(--mantine-color-green-light)', outline: 'var(--mantine-color-green-5)' },
  if_needed: { background: 'var(--mantine-color-yellow-light)', outline: 'var(--mantine-color-yellow-5)' },
};

export function GuestView({ token }: { token: string }) {
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tz, setTz] = useState('UTC');
  const [myIntervals, setMyIntervals] = useState<MsInterval[]>([]);
  const [saved, setSaved] = useState<MsInterval[]>([]);
  const [step, setStep] = useState(30); // painting grid step, remembered per guest
  const [paintMode, setPaintMode] = useState<PaintMode>('yes');
  const [saving, setSaving] = useState(false);

  useEffect(() => setTz(detectTimezone()), []);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<MeetingDetail>(`/api/g/${token}`);
      setDetail(d);
      const guestId = d.viewer.kind === 'guest' ? d.viewer.guestId : null;
      const me = d.guests.find((g) => g.id === guestId);
      const intervals = fromIso(me?.intervals ?? []);
      setMyIntervals(intervals);
      setSaved(intervals);
      if (me?.step) setStep(me.step);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    }
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  const dirty = !sameIntervals(myIntervals, saved);
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

  // Minute-precision evaluation, with my unsaved painting applied live.
  const ev = useMemo(
    () => (detail ? evaluateMeeting(detail, tz, myIntervals) : null),
    [detail, tz, myIntervals],
  );
  const ranges = useMemo(() => (ev ? computeRanges(ev) : []), [ev]);
  const participants = ev?.participants ?? [];

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/api/g/${token}`, {
        method: 'PUT',
        body: JSON.stringify({ intervals: toIso(myIntervals), timezone: tz, step }),
      });
      setSaved(myIntervals);
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
  if (!detail || !ev) {
    return (
      <Center h="60vh">
        <Loader />
      </Center>
    );
  }

  const { meeting, viewer } = detail;
  const myName = viewer.kind === 'guest' ? viewer.name : '';
  // My painting (edited here, so clearly visible), clipped to each day.
  const myBlocks = (d: number): MyBlock[] => {
    const day = ev.days[d];
    return myIntervals.flatMap((i) => {
      const a = Math.max(0, (i.start - day.start) / 60_000);
      const b = Math.min(day.minutes, (i.end - day.start) / 60_000);
      if (b <= a) return [];
      return [
        {
          startMin: a,
          endMin: b,
          // My painting: light tint + outline; what matches for everyone is
          // drawn solid with a check on top.
          ...PAINT[i.status],
        },
      ];
    });
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
                <Group gap="sm">
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
                  <Group gap={6}>
                    <Text size="xs" c="dimmed">
                      Pas :
                    </Text>
                    <SegmentedControl
                      size="xs"
                      value={String(step)}
                      onChange={(v) => setStep(Number(v))}
                      data={GUEST_STEPS.map((s) => ({ value: String(s), label: STEP_LABEL[s] }))}
                    />
                  </Group>
                </Group>
                <Text size="xs" c="dimmed">
                  Cliquez-glissez pour peindre vos dispos. Réunion de{' '}
                  {formatDuration(meeting.duration)}.
                </Text>
              </Group>
              <Group gap="md">
                <Text size="xs" c="dimmed">
                  Vos dispos :
                </Text>
                {(['yes', 'if_needed'] as const).map((st) => (
                  <Group key={st} gap={6}>
                    <span
                      style={{
                        width: 18,
                        height: 14,
                        borderRadius: 3,
                        background: PAINT[st].background,
                        boxShadow: `inset 0 0 0 1px ${PAINT[st].outline}`,
                      }}
                    />
                    <Text size="xs">{st === 'yes' ? 'dispo' : 'si besoin'}</Text>
                  </Group>
                ))}
              </Group>
              <StripeLegend />
              <AvailabilityGrid
                meeting={meeting}
                tz={tz}
                ev={ev}
                ranges={ranges}
                rowMinutes={step}
                myBlocks={myBlocks}
                editable
                myIntervals={myIntervals}
                onChange={setMyIntervals}
                paintMode={paintMode}
              />
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="results" pt="md">
            <MeetingResults
              ranges={ranges}
              participants={participants}
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
