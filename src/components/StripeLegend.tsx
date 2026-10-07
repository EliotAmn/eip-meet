import { Group, Text } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { heatColor } from './AvailabilityGrid';

function CheckSwatch({ bg, fg }: { bg: string; fg: string }) {
  return (
    <span
      style={{
        width: 18,
        height: 14,
        borderRadius: 3,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: bg,
        color: fg,
      }}
    >
      <IconCheck size={11} stroke={3} />
    </span>
  );
}

/** Legend of the per-slot results (a slot = a possible start time). */
export function StripeLegend() {
  return (
    <Group gap="md">
      <Group gap={6}>
        <CheckSwatch bg="var(--mantine-color-green-6)" fg="var(--mantine-color-white)" />
        <Text size="xs">tout le monde est dispo</Text>
      </Group>
      <Group gap={6}>
        <CheckSwatch bg="var(--mantine-color-yellow-5)" fg="var(--mantine-color-yellow-9)" />
        <Text size="xs">tout le monde, dont « si besoin »</Text>
      </Group>
      <Group gap={6}>
        <Group gap={2}>
          {[1, 2, 3, 4].map((l) => (
            <span key={l} style={{ width: 10, height: 14, borderRadius: 2, background: heatColor(l) }} />
          ))}
        </Group>
        <Text size="xs">fond : de peu à beaucoup de monde dispo</Text>
      </Group>
      <Text size="xs" c="dimmed">
        · Survolez un créneau pour le détail.
      </Text>
    </Group>
  );
}
