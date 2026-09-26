'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Chip,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { DateInput, DatePickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconRepeat, IconTrash } from '@tabler/icons-react';
import { DateTime } from 'luxon';
import { apiFetch } from '@/lib/api';
import type {
  EditScope,
  Freq,
  UnavailabilityDTO,
  UnavailabilityInput,
  UnavailabilityType,
} from '@/lib/types';

export type EventModalMode =
  | { kind: 'create'; draft: Partial<UnavailabilityInput> }
  | { kind: 'edit'; event: UnavailabilityDTO; date: string };

const TIMES = Array.from({ length: 97 }, (_, i) => {
  const m = i * 15;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
});
const START_TIMES = TIMES.slice(0, -1); // 00:00 .. 23:45
const END_TIMES = TIMES.slice(1); // 00:15 .. 24:00

const WEEKDAYS = [
  { value: '1', label: 'Lun' },
  { value: '2', label: 'Mar' },
  { value: '3', label: 'Mer' },
  { value: '4', label: 'Jeu' },
  { value: '5', label: 'Ven' },
  { value: '6', label: 'Sam' },
  { value: '7', label: 'Dim' },
];

const UNIT: Record<Freq, string> = { none: '', daily: 'jour(s)', weekly: 'semaine(s)', monthly: 'mois' };

interface Form {
  type: UnavailabilityType;
  title: string;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  freq: Freq;
  interval: number;
  byWeekday: string[];
  until: string | null;
}

const toDate = (iso: string | null) => (iso ? DateTime.fromISO(iso).toJSDate() : null);
const fromDate = (d: Date | null) => (d ? DateTime.fromJSDate(d).toISODate() : null);
const daysBetween = (a: string, b: string) =>
  Math.round(DateTime.fromISO(b).diff(DateTime.fromISO(a), 'days').days);

function initialForm(mode: EventModalMode): Form {
  if (mode.kind === 'create') {
    const d = mode.draft;
    const startDate = d.startDate ?? DateTime.now().toISODate()!;
    return {
      type: d.type ?? 'busy',
      title: d.title ?? '',
      allDay: d.allDay ?? false,
      startDate,
      endDate: d.endDate ?? startDate,
      startTime: d.startTime ?? '09:00',
      endTime: d.endTime ?? '10:00',
      freq: 'none',
      interval: 1,
      byWeekday: [String(DateTime.fromISO(startDate).weekday)],
      until: null,
    };
  }
  const { event: ev, date } = mode;
  const ex = ev.exceptions.find((x) => x.date === date);
  const span = daysBetween(ev.startDate, ev.endDate);
  return {
    type: ex?.type ?? ev.type,
    title: ex?.title ?? ev.title ?? '',
    allDay: ev.allDay,
    startDate: date,
    endDate: DateTime.fromISO(date).plus({ days: span }).toISODate()!,
    startTime: ex?.startTime ?? ev.startTime ?? '09:00',
    endTime: ex?.endTime ?? ev.endTime ?? '10:00',
    freq: ev.freq,
    interval: ev.interval,
    byWeekday: (ev.byWeekday.length ? ev.byWeekday : [DateTime.fromISO(ev.startDate).weekday]).map(String),
    until: ev.until,
  };
}

export function EventModal({
  mode,
  timezone,
  onClose,
  onSaved,
}: {
  mode: EventModalMode | null;
  timezone: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Form | null>(null);
  const [pending, setPending] = useState<'save' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(mode ? initialForm(mode) : null);
    setPending(null);
  }, [mode]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const editing = mode?.kind === 'edit' ? mode : null;
  const recurring = !!editing && editing.event.freq !== 'none';

  // Single-occurrence edits can only change title / type / times.
  const seriesChanged = useMemo(() => {
    if (!editing || !form) return false;
    const ev = editing.event;
    return (
      form.allDay !== ev.allDay ||
      form.freq !== ev.freq ||
      form.interval !== ev.interval ||
      (form.until ?? null) !== (ev.until ?? null) ||
      (form.freq === 'weekly' &&
        [...form.byWeekday].sort().join(',') !== [...ev.byWeekday].map(String).sort().join(','))
    );
  }, [editing, form]);

  if (!mode || !form) return null;

  function toInput(f: Form): UnavailabilityInput {
    return {
      title: f.title.trim() || null,
      type: f.type,
      allDay: f.allDay,
      startDate: f.startDate,
      endDate: f.allDay ? f.endDate : f.startDate,
      startTime: f.allDay ? null : f.startTime,
      endTime: f.allDay ? null : f.endTime,
      timezone: editing ? editing.event.timezone : timezone,
      freq: f.freq,
      interval: f.interval,
      byWeekday: f.freq === 'weekly' ? f.byWeekday.map(Number) : [],
      until: f.freq === 'none' ? null : f.until,
    };
  }

  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await fn();
      notifications.show({ color: 'teal', message });
      onSaved();
      onClose();
    } catch (err) {
      notifications.show({ color: 'red', message: err instanceof Error ? err.message : 'Erreur.' });
    } finally {
      setBusy(false);
    }
  }

  const save = (scope: EditScope) =>
    run(
      () =>
        editing
          ? apiFetch(`/api/unavailabilities/${editing.event.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ scope, date: editing.date, data: toInput(form) }),
            })
          : apiFetch('/api/unavailabilities', { method: 'POST', body: JSON.stringify(toInput(form)) }),
      editing ? 'Modifications enregistrées.' : 'Indisponibilité ajoutée.',
    );

  const remove = (scope: EditScope) =>
    run(
      () =>
        apiFetch(
          `/api/unavailabilities/${editing!.event.id}?scope=${scope}&date=${editing!.date}`,
          { method: 'DELETE' },
        ),
      'Supprimé.',
    );

  function onSubmit() {
    if (!form) return;
    if (!form.allDay && form.endTime <= form.startTime) {
      notifications.show({ color: 'red', message: "L'heure de fin doit être après le début." });
      return;
    }
    if (recurring) setPending('save');
    else save('all');
  }

  const scopeChooser = pending && (
    <Stack gap="xs">
      <Text size="sm">
        {pending === 'save'
          ? 'Cet événement se répète. Appliquer les modifications à :'
          : 'Cet événement se répète. Supprimer :'}
      </Text>
      {(pending === 'delete' || !seriesChanged) && (
        <Button
          variant="default"
          loading={busy}
          onClick={() => (pending === 'save' ? save('this') : remove('this'))}
        >
          Cet événement uniquement
        </Button>
      )}
      <Button
        variant="default"
        loading={busy}
        onClick={() => (pending === 'save' ? save('following') : remove('following'))}
      >
        Cet événement et les suivants
      </Button>
      <Button
        variant="default"
        color={pending === 'delete' ? 'red' : undefined}
        loading={busy}
        onClick={() => (pending === 'save' ? save('all') : remove('all'))}
      >
        Tous les événements
      </Button>
      <Button variant="subtle" onClick={() => setPending(null)}>
        Annuler
      </Button>
    </Stack>
  );

  return (
    <Modal
      opened
      onClose={onClose}
      title={editing ? "Modifier l'indisponibilité" : 'Nouvelle indisponibilité'}
      centered
      size="md"
    >
      {scopeChooser || (
        <Stack gap="sm">
          <SegmentedControl
            fullWidth
            value={form.type}
            onChange={(v) => set('type', v as UnavailabilityType)}
            data={[
              { value: 'busy', label: 'Indisponible' },
              { value: 'soft', label: 'Si besoin (à éviter)' },
            ]}
            color={form.type === 'busy' ? 'red' : 'yellow'}
          />
          <TextInput
            label="Titre"
            placeholder="Ex : Cours, rendez-vous, congés…"
            value={form.title}
            onChange={(e) => set('title', e.currentTarget.value)}
          />
          <Switch
            label="Toute la journée"
            checked={form.allDay}
            onChange={(e) => set('allDay', e.currentTarget.checked)}
            disabled={!!editing && recurring}
          />

          {form.allDay ? (
            <DatePickerInput
              type="range"
              label="Jours"
              value={[toDate(form.startDate), toDate(form.endDate)]}
              onChange={([a, b]) => {
                if (a) set('startDate', fromDate(a)!);
                set('endDate', fromDate(b ?? a) ?? form.startDate);
              }}
              allowSingleDateInRange
              disabled={recurring}
            />
          ) : (
            <Group grow align="flex-end">
              <DateInput
                label="Date"
                value={toDate(form.startDate)}
                onChange={(d) => d && set('startDate', fromDate(d)!)}
                valueFormat="DD/MM/YYYY"
                disabled={recurring}
              />
              <Select
                label="De"
                data={START_TIMES}
                value={form.startTime}
                onChange={(v) => v && set('startTime', v)}
                searchable
                allowDeselect={false}
                comboboxProps={{ withinPortal: true }}
              />
              <Select
                label="À"
                data={END_TIMES}
                value={form.endTime}
                onChange={(v) => v && set('endTime', v)}
                searchable
                allowDeselect={false}
                comboboxProps={{ withinPortal: true }}
              />
            </Group>
          )}
          {recurring && (
            <Text size="xs" c="dimmed">
              Occurrence du {DateTime.fromISO(editing!.date).setLocale('fr').toFormat('cccc d LLLL')}.
              Pour la déplacer à un autre jour, supprimez-la puis créez-en une nouvelle.
            </Text>
          )}

          <Group grow align="flex-end">
            <Select
              label="Répétition"
              leftSection={<IconRepeat size={14} />}
              data={[
                { value: 'none', label: 'Ne se répète pas' },
                { value: 'daily', label: 'Tous les jours' },
                { value: 'weekly', label: 'Toutes les semaines' },
                { value: 'monthly', label: 'Tous les mois' },
              ]}
              value={form.freq}
              onChange={(v) => v && set('freq', v as Freq)}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
            />
            {form.freq !== 'none' && (
              <NumberInput
                label={`Tous les … ${UNIT[form.freq]}`}
                min={1}
                max={99}
                value={form.interval}
                onChange={(v) => set('interval', Math.max(1, Number(v) || 1))}
              />
            )}
          </Group>

          {form.freq === 'weekly' && (
            <Chip.Group
              multiple
              value={form.byWeekday}
              onChange={(v) => set('byWeekday', v.length ? v : form.byWeekday)}
            >
              <Group gap={6}>
                {WEEKDAYS.map((d) => (
                  <Chip key={d.value} value={d.value} size="xs">
                    {d.label}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          )}

          {form.freq !== 'none' && (
            <DateInput
              label="Jusqu'au (optionnel)"
              placeholder="Sans fin"
              value={toDate(form.until)}
              onChange={(d) => set('until', fromDate(d))}
              valueFormat="DD/MM/YYYY"
              clearable
            />
          )}

          <Group justify="space-between" mt="sm">
            {editing ? (
              <Button
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={() => (recurring ? setPending('delete') : remove('all'))}
                loading={busy && !recurring}
              >
                Supprimer
              </Button>
            ) : (
              <span />
            )}
            <Group gap="sm">
              <Button variant="default" onClick={onClose}>
                Annuler
              </Button>
              <Button onClick={onSubmit} loading={busy && !pending}>
                Enregistrer
              </Button>
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
