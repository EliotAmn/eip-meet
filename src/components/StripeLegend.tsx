import { Group, Text } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';

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
        <CheckSwatch bg="var(--mantine-color-green-3)" fg="var(--mantine-color-green-9)" />
        <Text size="xs">tout le monde est dispo</Text>
      </Group>
      <Group gap={6}>
        <CheckSwatch bg="var(--mantine-color-yellow-2)" fg="var(--mantine-color-yellow-9)" />
        <Text size="xs">tout le monde, dont « si besoin »</Text>
      </Group>
      <Group gap={6}>
        <span
          style={{
            width: 4,
            height: 14,
            borderRadius: 2,
            background: 'var(--mantine-color-orange-6)',
            opacity: 0.5,
          }}
        />
        <Text size="xs">il manque 1 personne</Text>
      </Group>
      <Text size="xs" c="dimmed">
        · Survolez un créneau pour le détail.
      </Text>
    </Group>
  );
}
