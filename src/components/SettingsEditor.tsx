'use client';

import { useState } from 'react';
import {
  Stack,
  TextInput,
  SegmentedControl,
  Group,
  Select,
  Button,
  Text,
  InputLabel,
  Input,
  Alert,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconDeviceFloppy, IconInfoCircle } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { DateTime } from 'luxon';
import { apiFetch } from '@/lib/api';
import type { PollConfig } from '@/lib/types';

const HOUR_OPTIONS = Array.from({ length: 25 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, '0')}:00`,
}));

function toISODate(d: Date | null): string | null {
  return d ? DateTime.fromJSDate(d).toFormat('yyyy-MM-dd') : null;
}

export function SettingsEditor({
  token,
  poll,
  onSaved,
  onCancel,
}: {
  token: string;
  poll: PollConfig;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(poll.title);
  const [range, setRange] = useState<[Date | null, Date | null]>([
    DateTime.fromISO(poll.dateMin).toJSDate(),
    DateTime.fromISO(poll.dateMax).toJSDate(),
  ]);
  const [granularity, setGranularity] = useState(String(poll.granularity));
  const [dayStart, setDayStart] = useState(String(poll.dayStart));
  const [dayEnd, setDayEnd] = useState(String(poll.dayEnd));
  const [saving, setSaving] = useState(false);

  async function save() {
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

    setSaving(true);
    try {
      await apiFetch(`/api/admin/${token}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: title.trim(),
          dateMin,
          dateMax,
          granularity: Number(granularity),
          dayStart: Number(dayStart),
          dayEnd: Number(dayEnd),
        }),
      });
      await onSaved();
    } catch (err) {
      notifications.show({
        color: 'red',
        message: err instanceof Error ? err.message : 'Erreur.',
      });
    } finally {
      setSaving(false);
    }
  }

  const granularityChanged = Number(granularity) !== poll.granularity;

  return (
    <Stack gap="md">
      <TextInput
        label="Titre du sondage"
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
      </div>

      {granularityChanged && (
        <Alert color="yellow" variant="light" icon={<IconInfoCircle size={16} />}>
          Changer la granularité peut désaligner des disponibilités déjà saisies :
          celles qui ne tombent plus sur un créneau ne s'afficheront plus dans la
          grille (elles ne sont pas supprimées).
        </Alert>
      )}

      <Group justify="flex-end" gap="sm">
        <Button variant="default" onClick={onCancel} disabled={saving}>
          Annuler
        </Button>
        <Button onClick={save} loading={saving} leftSection={<IconDeviceFloppy size={16} />}>
          Enregistrer
        </Button>
      </Group>
      <Text size="xs" c="dimmed">
        Les fuseaux horaires restent gérés automatiquement ; ces réglages
        s'appliquent à tous les participants.
      </Text>
    </Stack>
  );
}
