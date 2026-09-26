'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Group,
  Input,
  InputLabel,
  NumberInput,
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
import { formatDuration } from '@/lib/time';
import { noAutofill } from '@/lib/noAutofill';
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
  const initialDuration = initial?.duration ?? 60;
  const [durationHours, setDurationHours] = useState(Math.floor(initialDuration / 60));
  const [durationMins, setDurationMins] = useState(initialDuration % 60);
  const durationMinutes = durationHours * 60 + durationMins;
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
    if (durationMinutes < 5) {
      return notifications.show({ color: 'red', message: 'La réunion doit durer au moins 5 minutes.' });
    }
    if (Number(dayEnd) <= Number(dayStart)) {
      return notifications.show({ color: 'red', message: "L'heure de fin doit être après le début." });
    }
    const settings = {
      title: title.trim(),
      dateMin,
      dateMax,
      duration: durationMinutes,
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
        router.push(`/meetings/${id}?participants=1`);
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
      <Input.Wrapper
        label="Durée de la réunion"
        description={`Un créneau n'est retenu que si chacun est dispo sur toute la durée (${formatDuration(
          Math.max(0, durationMinutes),
        )}).`}
      >
        <Group grow mt={4}>
          <NumberInput
            aria-label="Heures"
            suffix=" h"
            min={0}
            max={12}
            clampBehavior="strict"
            allowDecimal={false}
            value={durationHours}
            onChange={(v) => setDurationHours(Number(v) || 0)}
          />
          <NumberInput
            aria-label="Minutes"
            suffix=" min"
            min={0}
            max={59}
            step={5}
            clampBehavior="strict"
            allowDecimal={false}
            value={durationMins}
            onChange={(v) => setDurationMins(Number(v) || 0)}
          />
        </Group>
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
            {...noAutofill}
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
            {...noAutofill}
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
