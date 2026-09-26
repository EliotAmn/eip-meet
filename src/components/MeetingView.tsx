'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ActionIcon,
  Alert,
  Anchor,
  Avatar,
  Badge,
  Button,
  Center,
  Divider,
  Group,
  Loader,
  Menu,
  Modal,
  Stack,
  Tabs,
  TagsInput,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCalendarEvent,
  IconDots,
  IconListCheck,
  IconPencil,
  IconSettings,
  IconTrash,
  IconUserPlus,
  IconUsers,
} from '@tabler/icons-react';
import { DateTime } from 'luxon';
import { apiFetch } from '@/lib/api';
import { noAutofill } from '@/lib/noAutofill';
import { avatarColor, initials } from '@/lib/avatar';
import { buildAvailability, meetingSlotKeys } from '@/lib/availability';
import type { MeetingDetail, MemberAvailability } from '@/lib/types';
import { AvailabilityGrid } from './AvailabilityGrid';
import { CopyLinkButton } from './CopyLinkButton';
import { MeetingForm, useAccountEmails } from './MeetingForm';
import { MeetingResults } from './MeetingResults';
import { StripeLegend } from './StripeLegend';

const GRAN_LABEL: Record<number, string> = { 15: '15 min', 30: '30 min', 60: '1 heure' };
// My calendar-derived status: not editable here, so shown discreetly.
const HATCH =
  'repeating-linear-gradient(135deg, color-mix(in srgb, var(--mantine-color-red-7) 22%, transparent) 0 4px, transparent 4px 8px)';
const SOFT_FILL = 'color-mix(in srgb, var(--mantine-color-yellow-5) 16%, transparent)';

export function periodLabel(dateMin: string, dateMax: string) {
  const a = DateTime.fromISO(dateMin).setLocale('fr');
  const b = DateTime.fromISO(dateMax).setLocale('fr');
  return dateMin === dateMax
    ? a.toFormat('cccc d LLLL yyyy')
    : `du ${a.toFormat('cccc d LLLL')} au ${b.toFormat('cccc d LLLL yyyy')}`;
}

export function MeetingView({ id, tz, meEmail }: { id: string; tz: string; meEmail: string | null }) {
  const router = useRouter();
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);
  const [guestName, setGuestName] = useState('');
  const [origin, setOrigin] = useState('');
  const suggestions = useAccountEmails(meEmail);

  useEffect(() => {
    setOrigin(window.location.origin);
    // Right after creation: open the participants popup to share guest links.
    const url = new URL(window.location.href);
    if (url.searchParams.has('participants')) {
      setParticipantsOpen(true);
      url.searchParams.delete('participants');
      window.history.replaceState(null, '', url.pathname + url.search);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setDetail(await apiFetch<MeetingDetail>(`/api/meetings/${id}`));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const keys = useMemo(() => (detail ? meetingSlotKeys(detail.meeting, tz) : []), [detail, tz]);
  const { participants, statuses } = useMemo(
    () => (detail ? buildAvailability(detail, tz, keys) : { participants: [], statuses: new Map() }),
    [detail, tz, keys],
  );

  if (error) {
    return (
      <Alert color="red" title="Réunion inaccessible" maw={600}>
        {error}
      </Alert>
    );
  }
  if (!detail) {
    return (
      <Center h="50vh">
        <Loader />
      </Center>
    );
  }

  const { meeting, viewer } = detail;
  const isAdmin = viewer.kind === 'member' && viewer.isAdmin;
  const isOwner = viewer.kind === 'member' && viewer.role === 'owner';
  const me = participants.find((p) => p.isMe);
  const myMember = detail.members.find((m) => viewer.kind === 'member' && m.id === viewer.memberId);

  // My own status as the cell background: hatched = busy, yellow = si besoin.
  const myFill = (key: string) => {
    if (!me || !me.answered) return null;
    const s = statuses.get(key)?.get(me.id);
    if (s === 'yes') return null;
    return s === 'if_needed' ? SOFT_FILL : HATCH;
  };

  async function act(fn: () => Promise<unknown>, message?: string) {
    try {
      await fn();
      if (message) notifications.show({ color: 'teal', message });
      await load();
      router.refresh();
    } catch (err) {
      notifications.show({ color: 'red', message: err instanceof Error ? err.message : 'Erreur.' });
    }
  }

  const invite = () =>
    act(async () => {
      await apiFetch(`/api/meetings/${id}/members`, {
        method: 'POST',
        body: JSON.stringify({ emails: inviteEmails }),
      });
      setInviteEmails([]);
    }, 'Invitation ajoutée.');

  const addGuest = () =>
    act(async () => {
      await apiFetch(`/api/meetings/${id}/guests`, {
        method: 'POST',
        body: JSON.stringify({ name: guestName }),
      });
      setGuestName('');
    }, 'Invité ajouté.');

  const setRole = (m: MemberAvailability, role: 'admin' | 'member') =>
    act(() =>
      apiFetch(`/api/meetings/${id}/members`, { method: 'PATCH', body: JSON.stringify({ id: m.id, role }) }),
    );

  const removeMember = (m: MemberAvailability) =>
    act(() => apiFetch(`/api/meetings/${id}/members?id=${m.id}`, { method: 'DELETE' }), 'Membre retiré.');

  const removeGuest = (guestId: string) =>
    act(() => apiFetch(`/api/meetings/${id}/guests?id=${guestId}`, { method: 'DELETE' }), 'Invité retiré.');

  const saveRename = () =>
    rename &&
    act(async () => {
      await apiFetch(`/api/meetings/${id}/guests`, {
        method: 'PATCH',
        body: JSON.stringify({ id: rename.id, name: rename.name }),
      });
      setRename(null);
    }, 'Invité renommé.');

  const deleteMeeting = async () => {
    try {
      await apiFetch(`/api/meetings/${id}`, { method: 'DELETE' });
      notifications.show({ color: 'teal', message: 'Réunion supprimée.' });
      router.push('/');
      router.refresh();
    } catch (err) {
      notifications.show({ color: 'red', message: err instanceof Error ? err.message : 'Erreur.' });
    }
  };

  const answeredCount = participants.filter((p) => p.answered).length;

  return (
    <Stack gap="md" maw={1100}>
      {/* Compact header: the calendar below is what matters. */}
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <div style={{ minWidth: 0 }}>
          <Title order={3}>{meeting.title}</Title>
          <Text size="sm" c="dimmed">
            {periodLabel(meeting.dateMin, meeting.dateMax)} · créneaux de{' '}
            {GRAN_LABEL[meeting.granularity]} · {meeting.dayStart}h-{meeting.dayEnd}h (heure locale)
          </Text>
        </div>
        <Group gap="xs" wrap="nowrap">
          <UnstyledButton onClick={() => setParticipantsOpen(true)} aria-label="Participants">
            <Avatar.Group spacing="xs">
              {participants.slice(0, 5).map((p) => (
                <Tooltip
                  key={p.id}
                  label={`${p.name}${p.answered ? '' : ' (en attente)'}`}
                  withArrow
                >
                  <Avatar
                    src={p.image}
                    size="sm"
                    radius="xl"
                    color={avatarColor(p.id)}
                    style={{ opacity: p.answered ? 1 : 0.4 }}
                  >
                    {initials(p.name)}
                  </Avatar>
                </Tooltip>
              ))}
              {participants.length > 5 && (
                <Avatar size="sm" radius="xl">
                  +{participants.length - 5}
                </Avatar>
              )}
            </Avatar.Group>
          </UnstyledButton>
          <Button
            variant="default"
            leftSection={<IconUsers size={16} />}
            rightSection={
              <Badge size="sm" variant="light" color={answeredCount === participants.length ? 'teal' : 'gray'}>
                {answeredCount}/{participants.length}
              </Badge>
            }
            onClick={() => setParticipantsOpen(true)}
          >
            Participants
          </Button>
          {isAdmin && (
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <ActionIcon variant="default" size="lg" aria-label="Paramètres de la réunion">
                  <IconDots size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconSettings size={14} />} onClick={() => setEditOpen(true)}>
                  Modifier la réunion
                </Menu.Item>
                {isOwner && (
                  <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => setDeleteOpen(true)}>
                    Supprimer
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </Group>

      <Modal
        opened={participantsOpen}
        onClose={() => setParticipantsOpen(false)}
        title="Participants"
        size="lg"
        centered
      >
        <Stack gap="sm">
          <Text fw={600}>Membres</Text>
          {detail.members.map((m) => {
            const isMeRow = viewer.kind === 'member' && viewer.memberId === m.id;
            return (
              <Group key={m.id} justify="space-between" wrap="nowrap">
                <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                  <Avatar src={m.image} radius="xl" color={avatarColor(m.userId ?? m.id)}>
                    {initials(m.name)}
                  </Avatar>
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={500} truncate>
                      {m.name}
                      {isMeRow ? ' (vous)' : ''}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {m.email}
                    </Text>
                  </div>
                </Group>
                <Group gap="xs" wrap="nowrap">
                  {m.role !== 'member' && (
                    <Badge size="sm" variant="light">
                      {m.role === 'owner' ? 'Créateur' : 'Admin'}
                    </Badge>
                  )}
                  {!m.userId ? (
                    <Badge size="sm" color="gray" variant="light">
                      Pas encore connecté
                    </Badge>
                  ) : !m.calendarFilled ? (
                    <Badge size="sm" color="orange" variant="light">
                      Calendrier vide
                    </Badge>
                  ) : null}
                  {isAdmin && m.role !== 'owner' && (
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray" aria-label="Actions">
                          <IconDots size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        {m.role === 'admin' ? (
                          <Menu.Item onClick={() => setRole(m, 'member')}>Retirer les droits admin</Menu.Item>
                        ) : (
                          <Menu.Item onClick={() => setRole(m, 'admin')}>Rendre admin</Menu.Item>
                        )}
                        <Menu.Item color="red" onClick={() => removeMember(m)}>
                          Retirer de la réunion
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  )}
                </Group>
              </Group>
            );
          })}
          {isAdmin && (
            <Group align="flex-end" gap="sm">
              <TagsInput
                {...noAutofill}
                style={{ flex: 1 }}
                label="Inviter des comptes"
                placeholder="email@exemple.com puis Entrée"
                data={suggestions}
                value={inviteEmails}
                onChange={setInviteEmails}
                splitChars={[',', ' ', ';']}
              />
              <Button leftSection={<IconUserPlus size={16} />} onClick={invite} disabled={inviteEmails.length === 0}>
                Inviter
              </Button>
            </Group>
          )}

          <Divider my="xs" />

          <Text fw={600}>Invités sans compte</Text>
          {detail.guests.length === 0 && (
            <Text size="sm" c="dimmed">
              Aucun invité.
            </Text>
          )}
          {detail.guests.map((g) => (
            <Group key={g.id} justify="space-between" wrap="nowrap">
              <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                <Avatar radius="xl" color={avatarColor(g.id)}>
                  {initials(g.name)}
                </Avatar>
                <Text size="sm" fw={500} truncate>
                  {g.name}
                </Text>
                <Badge size="sm" variant="light" color={g.slots.length > 0 ? 'teal' : 'gray'}>
                  {g.slots.length > 0 ? 'a répondu' : 'en attente'}
                </Badge>
              </Group>
              {isAdmin && g.token && (
                <Group gap="xs" wrap="nowrap">
                  <CopyLinkButton value={`${origin}/g/${g.token}`} />
                  <ActionIcon variant="subtle" color="gray" aria-label="Renommer" onClick={() => setRename({ id: g.id, name: g.name })}>
                    <IconPencil size={16} />
                  </ActionIcon>
                  <ActionIcon variant="subtle" color="red" aria-label="Retirer" onClick={() => removeGuest(g.id)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              )}
            </Group>
          ))}
          {isAdmin && (
            <Group align="flex-end" gap="sm">
              <TextInput
                {...noAutofill}
                style={{ flex: 1 }}
                label="Ajouter un invité"
                placeholder="Nom"
                value={guestName}
                onChange={(e) => setGuestName(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && guestName.trim() && addGuest()}
              />
              <Button variant="light" onClick={addGuest} disabled={!guestName.trim()}>
                Ajouter
              </Button>
            </Group>
          )}
        </Stack>
      </Modal>

      <Tabs defaultValue="grid" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="grid" leftSection={<IconCalendarEvent size={16} />}>
            Disponibilités
          </Tabs.Tab>
          <Tabs.Tab value="results" leftSection={<IconListCheck size={16} />}>
            Créneaux possibles
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="grid" pt="md">
          <Stack gap="sm">
            {myMember && (
              <Text size="xs" c="dimmed">
                Vos dispos viennent de votre calendrier (hachuré = indisponible, jaune = si
                besoin) :{' '}
                <Anchor component={Link} href="/" size="xs">
                  le modifier
                </Anchor>
                {' · '}Heures en {tz}.
              </Text>
            )}
            <StripeLegend />
            <AvailabilityGrid
              meeting={meeting}
              tz={tz}
              participants={participants}
              statuses={statuses}
              myFill={myFill}
            />
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="results" pt="md">
          <MeetingResults
            keys={keys}
            statuses={statuses}
            participants={participants}
            granularity={meeting.granularity}
            tz={tz}
          />
        </Tabs.Panel>
      </Tabs>

      <Modal opened={editOpen} onClose={() => setEditOpen(false)} title="Modifier la réunion" centered size="lg">
        <MeetingForm
          initial={meeting}
          meEmail={meEmail}
          onCancel={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            load();
          }}
        />
      </Modal>

      <Modal opened={deleteOpen} onClose={() => setDeleteOpen(false)} title="Supprimer la réunion ?" centered>
        <Stack>
          <Text size="sm">
            « {meeting.title} » et toutes les réponses des invités seront supprimées. Les calendriers des
            membres ne sont pas touchés.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteOpen(false)}>
              Annuler
            </Button>
            <Button color="red" onClick={deleteMeeting}>
              Supprimer
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={!!rename} onClose={() => setRename(null)} title="Renommer l'invité" centered>
        <Stack>
          <TextInput
            {...noAutofill}
            value={rename?.name ?? ''}
            onChange={(e) => setRename((r) => (r ? { ...r, name: e.currentTarget.value } : r))}
            onKeyDown={(e) => e.key === 'Enter' && saveRename()}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRename(null)}>
              Annuler
            </Button>
            <Button onClick={saveRename} disabled={!rename?.name.trim()}>
              Enregistrer
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
