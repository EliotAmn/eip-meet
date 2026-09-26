'use client';

import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  FileInput,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconFileImport } from '@tabler/icons-react';
import { apiFetch } from '@/lib/api';
import type { IcsAction, IcsChange, IcsPreview, IcsResult } from '@/lib/icsImport';

const SECTIONS: { action: IcsAction; label: string; color: string }[] = [
  { action: 'create', label: 'À ajouter', color: 'teal' },
  { action: 'update', label: 'À modifier', color: 'blue' },
  { action: 'delete', label: 'À supprimer (absents du fichier)', color: 'red' },
];

function plural(n: number, one: string, many: string) {
  return `${n} ${n > 1 ? many : one}`;
}

function ignoredLabel(i: IcsPreview['ignored']): string | null {
  const parts = [
    i.past && plural(i.past, 'passé', 'passés'),
    i.free && plural(i.free, 'marqué libre', 'marqués libres'),
    i.cancelled && plural(i.cancelled, 'annulé', 'annulés'),
    i.duplicates && plural(i.duplicates, 'doublon dans le fichier', 'doublons dans le fichier'),
    i.invalid && plural(i.invalid, 'illisible', 'illisibles'),
    i.overflow && plural(i.overflow, 'au-delà de la limite', 'au-delà de la limite'),
  ].filter(Boolean);
  return parts.length ? `Ignorés : ${parts.join(', ')}.` : null;
}

function ChangeRow({ c, checked, onToggle }: { c: IcsChange; checked: boolean; onToggle: () => void }) {
  return (
    <Checkbox
      checked={checked}
      onChange={onToggle}
      styles={{ body: { alignItems: 'flex-start' } }}
      label={
        <div>
          <Group gap={6} wrap="nowrap">
            <Badge variant="dot" size="xs" color={c.type === 'busy' ? 'red' : 'yellow'}>
              {c.type === 'busy' ? 'Indisponible' : 'Si besoin'}
            </Badge>
            <Text size="sm" fw={500} truncate td={c.action === 'delete' ? 'line-through' : undefined}>
              {c.title ?? 'Sans titre'}
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            {c.when}
          </Text>
          {c.before && (
            <Text size="xs" c="dimmed">
              Avant : {c.before}
            </Text>
          )}
        </div>
      }
    />
  );
}

export function IcsImportModal({
  opened,
  timezone,
  onClose,
  onImported,
}: {
  opened: boolean;
  timezone: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<IcsPreview | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setExcluded(new Set());
    setError(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  async function pick(f: File | null) {
    reset();
    if (!f) return;
    setLoading(true);
    try {
      const text = await f.text();
      const p = await apiFetch<IcsPreview>('/api/unavailabilities/import', {
        method: 'POST',
        body: JSON.stringify({ text, fileName: f.name, timezone }),
      });
      setFile({ name: f.name, text });
      setPreview(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (!file) return;
    setLoading(true);
    try {
      const r = await apiFetch<IcsResult>('/api/unavailabilities/import', {
        method: 'POST',
        body: JSON.stringify({
          text: file.text,
          fileName: file.name,
          timezone,
          apply: true,
          exclude: [...excluded],
        }),
      });
      const parts = [
        r.created && plural(r.created, 'ajouté', 'ajoutés'),
        r.updated && plural(r.updated, 'modifié', 'modifiés'),
        r.deleted && plural(r.deleted, 'supprimé', 'supprimés'),
        r.linked && plural(r.linked, 'relié', 'reliés'),
      ].filter(Boolean);
      notifications.show({
        color: 'teal',
        message: parts.length ? `Import terminé : ${parts.join(', ')}.` : 'Rien à changer.',
      });
      onImported();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setLoading(false);
    }
  }

  const toggle = (keys: string[], on: boolean) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.delete(k);
        else next.add(k);
      }
      return next;
    });

  const changes = preview?.changes ?? [];
  const selected = changes.filter((c) => !excluded.has(c.key)).length;
  const ignored = preview ? ignoredLabel(preview.ignored) : null;

  return (
    <Modal opened={opened} onClose={close} title="Importer un calendrier (.ics)" size="lg">
      <Stack gap="sm">
        {!preview && (
          <>
            <Text size="sm" c="dimmed">
              Export .ics de Google Agenda, Outlook ou Calendrier Apple. Vous verrez les changements
              avant de valider. Réimporter une version à jour n&apos;ajoute pas de doublons : seules
              les différences sont appliquées.
            </Text>
            <FileInput
              accept=".ics,text/calendar"
              placeholder="Choisir un fichier .ics"
              leftSection={<IconFileImport size={16} />}
              onChange={pick}
              disabled={loading}
              clearable
            />
          </>
        )}

        {loading && !preview && (
          <Group justify="center">
            <Loader size="sm" />
          </Group>
        )}
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}

        {preview && (
          <>
            <Group gap="xs">
              <Text size="sm">
                Calendrier <b>{preview.source}</b>
              </Text>
              <Text size="xs" c="dimmed">
                ({file?.name})
              </Text>
            </Group>
            <Group gap="xs">
              {SECTIONS.map((s) => {
                const n = changes.filter((c) => c.action === s.action).length;
                return n ? (
                  <Badge key={s.action} color={s.color} variant="light">
                    {n} {s.label.split(' (')[0].toLowerCase()}
                  </Badge>
                ) : null;
              })}
              {preview.unchanged > 0 && (
                <Badge color="gray" variant="light">
                  {preview.unchanged} déjà à jour
                </Badge>
              )}
            </Group>
            {preview.linked > 0 && (
              <Text size="xs" c="dimmed">
                {plural(preview.linked, 'événement déjà présent', 'événements déjà présents')} dans
                votre calendrier : relié{preview.linked > 1 ? 's' : ''} au fichier, sans doublon.
              </Text>
            )}
            {ignored && (
              <Text size="xs" c="dimmed">
                {ignored}
              </Text>
            )}

            {changes.length === 0 ? (
              <Alert color="teal" variant="light" icon={<IconCheck size={16} />}>
                Votre calendrier est déjà à jour avec ce fichier.
              </Alert>
            ) : (
              <ScrollArea.Autosize mah="50vh" type="auto" offsetScrollbars>
                <Stack gap="md">
                  {SECTIONS.map((s) => {
                    const list = changes.filter((c) => c.action === s.action);
                    if (!list.length) return null;
                    const keys = list.map((c) => c.key);
                    const on = keys.filter((k) => !excluded.has(k)).length;
                    return (
                      <Stack key={s.action} gap={8}>
                        <Checkbox
                          color={s.color}
                          checked={on === keys.length}
                          indeterminate={on > 0 && on < keys.length}
                          onChange={() => toggle(keys, on < keys.length)}
                          label={
                            <Text size="sm" fw={600}>
                              {s.label} ({list.length})
                            </Text>
                          }
                        />
                        <Stack gap={8} pl="lg">
                          {list.map((c) => (
                            <ChangeRow
                              key={c.key}
                              c={c}
                              checked={!excluded.has(c.key)}
                              onToggle={() => toggle([c.key], excluded.has(c.key))}
                            />
                          ))}
                        </Stack>
                      </Stack>
                    );
                  })}
                </Stack>
              </ScrollArea.Autosize>
            )}

            <Group justify="space-between" mt="xs">
              <Button variant="default" onClick={reset} disabled={loading}>
                Autre fichier
              </Button>
              <Button
                onClick={apply}
                loading={loading}
                disabled={selected === 0 && preview.linked === 0}
              >
                {selected > 0 ? `Appliquer ${plural(selected, 'changement', 'changements')}` : 'Valider'}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
