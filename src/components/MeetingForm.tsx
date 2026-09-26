'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Group,
  Input,
  InputLabel,
  SegmentedControl,
  Select,
  Stack,
  TagsInput,
  Text,
  TextInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { DateTime } from 'luxon';
import { apiFetch } from '@/lib/api';
import type { MeetingConfig } from '@/lib/types';

const HOUR_OPTIONS = Array.from({ length: 25 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, '0')}:00`,
}));

const toDate = (iso: string) => DateTime.fromISO(iso).toJSDate();
const fromDate = (d: Date | null) => (d ? DateTime.fromJSDate(d).toISODate() : null);

/** Email suggestions: accounts already known to this instance. */
export function useAccountEmails(exclude?: string | null) {
  const [emails, setEmails] = useState<string[]>([]);
  useEffect(() => {
    apiFetch<{ email: string | null }[]>('/api/users')
      .then((users) =>
        setEmails(
          users
            .map((u) => u.email?.toLowerCase())
            .filter((e): e is string => !!e && e !== exclude?.toLowerCase()),
        ),
      )
      .catch(() => {});
  }, [exclude]);
  return emails;
}

export function MeetingForm({
  initial,
  onSaved,
  onCancel,
  meEmail,
}: {
  /** Edit mode when provided. */
  initial?: MeetingConfig;
  onSaved?: () => void;
  onCancel?: () => void;
  meEmail?: string | null;
}) {
  const router = useRouter();
  const editing = !!initial;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [range, setRange] = useState<[Date | null, Date | null]>(
    initial ? [toDate(initial.dateMin), toDate(initial.dateMax)] : [null, null],
  );
  const [granularity, setGranularity] = useState(String(initial?.granularity ?? 30));
  const [dayStart, setDayStart] = useState(String(initial?.dayStart ?? 8));
  const [dayEnd, setDayEnd] = useState(String(initial?.dayEnd ?? 20));
  const [memberEmails, setMemberEmails] = useState<string[]>([]);
  const [guestNames, setGuestNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const suggestions = useAccountEmails(meEmail);

  async function submit() {
    const dateMin = fromDate(range[0]);
    const dateMax = fromDate(range[1] ?? range[0]);
    if (!title.trim()) return notifications.show({ color: 'red', message: 'Donnez un titre.' });
    if (!dateMin || !dateMax) {
      return notifications.show({ color: 'red', message: 'Choisissez la période de la réunion.' });
    }
    if (Number(dayEnd) <= Number(dayStart)) {
      return notifications.show({ color: 'red', message: "L'heure de fin doit être après le début." });
    }
    const settings = {
      title: title.trim(),
      dateMin,
      dateMax,
      granularity: Number(granularity),
      dayStart: Number(dayStart),
      dayEnd: Number(dayEnd),
    };
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`/api/meetings/${initial.id}`, { method: 'PATCH', body: JSON.stringify(settings) });
        notifications.show({ color: 'teal', message: 'Réunion mise à jour.' });
        router.refresh();
        onSaved?.();
      } else {
        const { id } = await apiFetch<{ id: string }>('/api/meetings', {
          method: 'POST',
          body: JSON.stringify({ ...settings, memberEmails, guestNames }),
        });
        router.push(`/meetings/${id}`);
        router.refresh();
      }
    } catch (err) {
      notifications.show({ color: 'red', message: err instanceof Error ? err.message : 'Erreur.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack gap="md">
      <TextInput
        label="Titre"
        placeholder="Ex : Point d'équipe mensuel"
        value={title}
        onChange={(e) => setTitle(e.currentTarget.value)}
        required
      />
      <DatePickerInput
        type="range"
        label="Période de la réunion"
        description="La réunion aura lieu quelque part entre ces deux dates."
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

      {!editing && (
        <>
          <TagsInput
            label="Membres (comptes)"
            description="Emails des personnes avec un compte. Leurs dispos viennent de leur calendrier."
            placeholder="email@exemple.com puis Entrée"
            data={suggestions}
            value={memberEmails}
            onChange={setMemberEmails}
            clearable
            splitChars={[',', ' ', ';']}
          />
          <TagsInput
            label="Invités sans compte"
            description="Un lien personnel sera généré pour chacun ; ils peignent leurs dispos."
            placeholder="Nom puis Entrée"
            value={guestNames}
            onChange={setGuestNames}
            clearable
          />
          <Text size="xs" c="dimmed">
            Vous êtes automatiquement admin de la réunion. Vous pourrez inviter d&apos;autres
            personnes ensuite.
          </Text>
        </>
      )}

      <Group justify="flex-end" gap="sm">
        {onCancel && (
          <Button variant="default" onClick={onCancel}>
            Annuler
          </Button>
        )}
        <Button onClick={submit} loading={saving}>
          {editing ? 'Enregistrer' : 'Créer la réunion'}
        </Button>
      </Group>
    </Stack>
  );
}
