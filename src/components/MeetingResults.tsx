'use client';

import { useMemo, useState } from 'react';
import { Stack, Paper, Group, Text, Badge, SegmentedControl, Switch, Box } from '@mantine/core';
import { IconUsers, IconMoodEmpty } from '@tabler/icons-react';
import { DateTime } from 'luxon';
import type { AvailabilityRange, GridParticipant } from '@/lib/availability';
import { formatDuration, formatRange } from '@/lib/time';

export function MeetingResults({
  ranges,
  participants,
  duration,
  tz,
}: {
  /** Windows in which the meeting fits (see computeRanges). */
  ranges: AvailabilityRange[];
  participants: GridParticipant[];
  duration: number;
  tz: string;
}) {
  const total = participants.length;
  const [minCount, setMinCount] = useState(Math.max(1, total));
  const [hidePast, setHidePast] = useState(true);
  const [sortMode, setSortMode] = useState<'time' | 'best'>('time');
  const now = useMemo(() => DateTime.utc().toISO()!, []);


  const filtered = useMemo(() => {
    let r = ranges.filter((x) => x.count >= Math.min(minCount, total));
    if (hidePast) r = r.filter((x) => x.endUtc > now);
    if (sortMode === 'best') {
      r = [...r].sort(
        (a, b) =>
          b.count - a.count || a.ifNeeded - b.ifNeeded || a.startUtc.localeCompare(b.startUtc),
      );
    }
    return r;
  }, [ranges, minCount, total, hidePast, sortMode, now]);

  const minOptions = Array.from({ length: total }, (_, i) => {
    const n = total - i;
    return { value: String(n), label: n === total ? `Tous (${n})` : `≥ ${n}` };
  });

  if (total === 0) {
    return (
      <Text c="dimmed" size="sm">
        Aucun participant pour l&apos;instant.
      </Text>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Box>
          <Text size="sm" fw={600} mb={4}>
            Participants disponibles minimum
          </Text>
          <SegmentedControl
            value={String(Math.min(minCount, total))}
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
              {minCount >= total && total > 1 ? ' Essayez un nombre minimum plus bas.' : ''}
            </Text>
          </Stack>
        </Paper>
      ) : (
        <Stack gap="xs">
          {filtered.map((r) => {
            const everyone = r.count === total;
            // Same colors as the grid: green = everyone "Dispo", yellow = everyone
            // but some only "si besoin".
            const hue = r.ifNeeded > 0 ? 'yellow' : 'green';
            const shade = hue === 'yellow' ? 2 : 3; // light = matches, like the grid
            const accent = everyone ? `${hue}.${shade}` : 'gray';
            const window = Date.parse(r.endUtc) - Date.parse(r.startUtc);
            return (
              <Paper
                key={`${r.startUtc}-${r.ids.join(',')}`}
                withBorder
                p="md"
                radius="md"
                style={everyone ? { borderColor: `var(--mantine-color-${hue}-${shade})` } : undefined}
              >
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Box>
                    <Text fw={600} tt="capitalize">
                      {formatRange(r.startUtc, r.endUtc, tz)}
                    </Text>
                    <Text size="xs" c="dimmed" mt={2}>
                      {window > duration * 60_000
                        ? `Réunion de ${formatDuration(duration)} à placer dans cette plage`
                        : `Réunion de ${formatDuration(duration)}`}
                    </Text>
                    {r.ifNeeded > 0 && (
                      <Text size="xs" c="dimmed" mt={2}>
                        dont {r.ifNeeded} « si besoin »
                      </Text>
                    )}
                    <Group gap={6} mt={6}>
                      {r.names.map((name, i) => (
                        <Badge
                          key={r.ids[i]}
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
                    autoContrast
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
