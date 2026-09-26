'use client';

import { useMemo, useState } from 'react';
import {
  Stack,
  Paper,
  Group,
  Text,
  Badge,
  SegmentedControl,
  Switch,
  Alert,
  Box,
} from '@mantine/core';
import { IconUsers, IconMoodEmpty } from '@tabler/icons-react';
import { DateTime } from 'luxon';
import type { ParticipantPublic } from '@/lib/types';
import { computeAvailabilityRanges } from '@/lib/overlaps';
import { formatRange } from '@/lib/time';

interface ResultsListProps {
  participants: ParticipantPublic[];
  granularity: number;
  tz: string;
}

export function ResultsList({ participants, granularity, tz }: ResultsListProps) {
  const total = participants.length;
  const [minCount, setMinCount] = useState<number>(total);
  const [hidePast, setHidePast] = useState(true);
  const [sortMode, setSortMode] = useState<'time' | 'best'>('time');

  const nowISO = useMemo(() => DateTime.utc().toISO(), []);

  const ranges = useMemo(
    () => computeAvailabilityRanges(participants, granularity),
    [participants, granularity],
  );

  const filtered = useMemo(() => {
    let r = ranges.filter((x) => x.count >= minCount);
    if (hidePast) r = r.filter((x) => x.endUtc > (nowISO ?? ''));
    if (sortMode === 'best') {
      r = [...r].sort(
        (a, b) => b.count - a.count || a.startUtc.localeCompare(b.startUtc),
      );
    }
    return r;
  }, [ranges, minCount, hidePast, sortMode, nowISO]);

  const minOptions = Array.from({ length: total }, (_, i) => {
    const n = total - i; // total, total-1, ... 1
    return { value: String(n), label: n === total ? `Tous (${n})` : `≥ ${n}` };
  });

  const answered = participants.filter((p) => p.slots.length > 0).length;

  return (
    <Stack gap="md">
      {answered < total && (
        <Alert color="yellow" variant="light">
          {answered} / {total} participant(s) ont répondu. Les créneaux évolueront à
          mesure que les autres remplissent leurs dispos.
        </Alert>
      )}

      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Box>
          <Text size="sm" fw={600} mb={4}>
            Participants disponibles minimum
          </Text>
          <SegmentedControl
            value={String(minCount)}
            onChange={(v) => setMinCount(Number(v))}
            data={minOptions}
            size="xs"
          />
        </Box>
        <Group gap="md">
          <SegmentedControl
            value={sortMode}
            onChange={(v) => setSortMode(v as 'time' | 'best')}
            data={[
              { value: 'time', label: 'Plus proche' },
              { value: 'best', label: 'Meilleur' },
            ]}
            size="xs"
          />
          <Switch
            checked={hidePast}
            onChange={(e) => setHidePast(e.currentTarget.checked)}
            label="Masquer le passé"
            size="sm"
          />
        </Group>
      </Group>

      {filtered.length === 0 ? (
        <Paper withBorder p="xl" radius="md">
          <Stack align="center" gap="xs">
            <IconMoodEmpty size={32} opacity={0.5} />
            <Text c="dimmed" ta="center">
              Aucun créneau ne correspond à ce filtre.
              {minCount === total && total > 1
                ? ' Essayez un nombre minimum plus bas.'
                : ''}
            </Text>
          </Stack>
        </Paper>
      ) : (
        <Stack gap="xs">
          {filtered.map((r) => {
            const everyone = r.count === total;
            // green = everyone & all "yes"; yellow = everyone but some "si besoin".
            const accent = everyone
              ? r.ifNeeded > 0
                ? 'yellow'
                : 'green'
              : 'gray';
            const highlighted = everyone;
            return (
              <Paper
                key={`${r.startUtc}-${r.ids.join(',')}`}
                withBorder
                p="md"
                radius="md"
                style={
                  highlighted
                    ? { borderColor: `var(--mantine-color-${accent}-5)` }
                    : undefined
                }
              >
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Box>
                    <Text fw={600} tt="capitalize">
                      {formatRange(r.startUtc, r.endUtc, tz)}
                    </Text>
                    {everyone && r.ifNeeded > 0 && (
                      <Text size="xs" c="yellow.7" mt={2}>
                        Tout le monde, mais {r.ifNeeded} « si besoin »
                      </Text>
                    )}
                    <Group gap={6} mt={6}>
                      {r.names.map((name, i) => (
                        <Badge
                          key={`${r.ids[i]}`}
                          variant="light"
                          color={everyone ? accent : 'indigo'}
                          size="sm"
                        >
                          {name}
                        </Badge>
                      ))}
                    </Group>
                  </Box>
                  <Badge
                    size="lg"
                    variant={everyone ? 'filled' : 'light'}
                    color={everyone ? accent : 'gray'}
                    leftSection={<IconUsers size={14} />}
                  >
                    {r.count}/{total}
                  </Badge>
                </Group>
              </Paper>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
