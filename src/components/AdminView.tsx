'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Container,
  Title,
  Text,
  Card,
  Stack,
  Group,
  TextInput,
  Button,
  Table,
  ActionIcon,
  Badge,
  Alert,
  Loader,
  Center,
  Divider,
  Anchor,
} from '@mantine/core';
import {
  IconTrash,
  IconUserPlus,
  IconInfoCircle,
  IconExternalLink,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { apiFetch } from '@/lib/api';
import type { AdminPageData } from '@/lib/types';
import { CopyLinkButton } from './CopyLinkButton';

const GRAN_LABEL: Record<number, string> = { 15: '15 min', 30: '30 min', 60: '1 heure' };

export function AdminView({ token }: { token: string }) {
  const [data, setData] = useState<AdminPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<AdminPageData>(`/api/admin/${token}`);
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function addParticipant() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      await apiFetch(`/api/admin/${token}/participants`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setNewName('');
      await load();
    } catch (err) {
      notifications.show({
        color: 'red',
        message: err instanceof Error ? err.message : 'Erreur.',
      });
    } finally {
      setAdding(false);
    }
  }

  async function removeParticipant(id: string, name: string) {
    if (!window.confirm(`Supprimer ${name} et ses réponses ?`)) return;
    try {
      await apiFetch(`/api/admin/${token}/participants?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      await load();
    } catch (err) {
      notifications.show({
        color: 'red',
        message: err instanceof Error ? err.message : 'Erreur.',
      });
    }
  }

  if (error) {
    return (
      <Container size="md" py="xl">
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

  const { poll, participants } = data;
  const adminUrl = origin ? `${origin}/admin/${token}` : '';

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <div>
          <Text size="sm" c="dimmed" tt="uppercase" fw={600}>
            Administration du sondage
          </Text>
          <Title order={1}>{poll.title}</Title>
        </div>

        <Alert icon={<IconInfoCircle size={18} />} color="indigo" variant="light">
          Cette page (URL admin) est votre accès privé pour gérer le sondage.{' '}
          <b>Gardez-la pour vous.</b> Partagez plutôt à chaque personne son lien
          participant individuel ci-dessous.
        </Alert>

        <Card withBorder radius="md" padding="lg">
          <Stack gap="sm">
            <Text fw={600}>Paramètres</Text>
            <Group gap="xs">
              <Badge variant="light">
                {poll.dateMin} → {poll.dateMax}
              </Badge>
              <Badge variant="light">
                {String(poll.dayStart).padStart(2, '0')}:00-
                {String(poll.dayEnd).padStart(2, '0')}:00 (heure locale)
              </Badge>
              <Badge variant="light">Créneaux de {GRAN_LABEL[poll.granularity]}</Badge>
            </Group>
            <Group gap="xs" mt="xs">
              <CopyLinkButton value={adminUrl} label="Copier l'URL admin" variant="default" />
            </Group>
          </Stack>
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Stack gap="md">
            <Text fw={600}>Participants ({participants.length})</Text>

            {participants.length > 0 && (
              <Table.ScrollContainer minWidth={520}>
                <Table verticalSpacing="sm" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Nom</Table.Th>
                      <Table.Th>Réponses</Table.Th>
                      <Table.Th>Lien participant</Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {participants.map((p) => {
                      const link = origin ? `${origin}/p/${p.token}` : '';
                      return (
                        <Table.Tr key={p.id}>
                          <Table.Td fw={500}>{p.name}</Table.Td>
                          <Table.Td>
                            {p.slotCount > 0 ? (
                              <Badge color="teal" variant="light">
                                {p.slotCount} créneaux
                              </Badge>
                            ) : (
                              <Badge color="gray" variant="light">
                                en attente
                              </Badge>
                            )}
                          </Table.Td>
                          <Table.Td>
                            <Group gap="xs" wrap="nowrap">
                              <CopyLinkButton value={link} />
                              <Anchor href={`/p/${p.token}`} target="_blank" title="Ouvrir">
                                <IconExternalLink size={16} />
                              </Anchor>
                            </Group>
                          </Table.Td>
                          <Table.Td>
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              onClick={() => removeParticipant(p.id, p.name)}
                              aria-label="Supprimer"
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}

            <Divider />

            <Group align="flex-end" gap="sm">
              <TextInput
                label="Ajouter un participant"
                placeholder="Nom"
                value={newName}
                onChange={(e) => setNewName(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addParticipant();
                }}
                style={{ flex: 1 }}
              />
              <Button
                onClick={addParticipant}
                loading={adding}
                leftSection={<IconUserPlus size={16} />}
              >
                Ajouter
              </Button>
            </Group>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
