'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  Stack,
  TextInput,
  SegmentedControl,
  Group,
  Select,
  TagsInput,
  Button,
  Text,
  InputLabel,
  Input,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { DateTime } from 'luxon';
import { apiFetch } from '@/lib/api';
import type { CreatePollInput } from '@/lib/types';

const HOUR_OPTIONS = Array.from({ length: 25 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, '0')}:00`,
}));

function toISODate(d: Date | null): string | null {
  if (!d) return null;
  return DateTime.fromJSDate(d).toFormat('yyyy-MM-dd');
}

export function CreateForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [range, setRange] = useState<[Date | null, Date | null]>([null, null]);
  const [granularity, setGranularity] = useState('30');
  const [dayStart, setDayStart] = useState('8');
  const [dayEnd, setDayEnd] = useState('20');
  const [participants, setParticipants] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const dateMin = toISODate(range[0]);
    const dateMax = toISODate(range[1]);

    if (!title.trim()) {
      notifications.show({ color: 'red', message: 'Donnez un titre au sondage.' });
      return;
    }
    if (!dateMin || !dateMax) {
      notifications.show({ color: 'red', message: 'Choisissez une plage de dates.' });
      return;
    }
    if (Number(dayEnd) <= Number(dayStart)) {
      notifications.show({
        color: 'red',
        message: "L'heure de fin doit être après l'heure de début.",
      });
      return;
    }
    if (participants.length === 0) {
      notifications.show({ color: 'red', message: 'Ajoutez au moins un participant.' });
      return;
    }

    const payload: CreatePollInput = {
      title: title.trim(),
      dateMin,
      dateMax,
      granularity: Number(granularity),
      dayStart: Number(dayStart),
      dayEnd: Number(dayEnd),
      participants,
    };

    setSubmitting(true);
    try {
      const { adminToken } = await apiFetch<{ adminToken: string }>('/api/polls', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      router.push(`/admin/${adminToken}`);
    } catch (err) {
      notifications.show({
        color: 'red',
        message: err instanceof Error ? err.message : 'Erreur inconnue.',
      });
      setSubmitting(false);
    }
  }

  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <TextInput
          label="Titre du sondage"
          placeholder="Ex : Réunion de lancement"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          required
        />

        <DatePickerInput
          type="range"
          label="Plage de dates possibles"
          placeholder="Du … au …"
          value={range}
          onChange={setRange}
          allowSingleDateInRange
          required
        />

        <Input.Wrapper label="Granularité des créneaux">
          <div>
            <SegmentedControl
              fullWidth
              value={granularity}
              onChange={setGranularity}
              data={[
                { value: '15', label: '15 min' },
                { value: '30', label: '30 min' },
                { value: '60', label: '1 heure' },
              ]}
            />
          </div>
        </Input.Wrapper>

        <div>
          <InputLabel>Plage horaire affichée (heure locale de chacun)</InputLabel>
          <Group grow align="flex-end">
            <Select
              label="De"
              data={HOUR_OPTIONS}
              value={dayStart}
              onChange={(v) => setDayStart(v ?? '8')}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
            />
            <Select
              label="À"
              data={HOUR_OPTIONS}
              value={dayEnd}
              onChange={(v) => setDayEnd(v ?? '20')}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
            />
          </Group>
          <Text size="xs" c="dimmed" mt={4}>
            Chaque participant verra cette plage dans son propre fuseau horaire.
          </Text>
        </div>

        <TagsInput
          label="Participants"
          description="Tapez un nom puis Entrée. Un lien unique sera généré pour chacun."
          placeholder="Ajouter un participant…"
          value={participants}
          onChange={setParticipants}
          clearable
        />

        <Group justify="flex-end">
          <Button onClick={handleSubmit} loading={submitting} size="md">
            Créer le sondage
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
