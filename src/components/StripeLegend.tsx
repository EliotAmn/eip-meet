import { Group, Text } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';

const STRIPES = [
  { color: 'var(--mantine-color-green-3)', label: 'tout le monde (dont « si besoin »)' },
  { color: 'var(--mantine-color-orange-6)', label: 'il manque 1 personne' },
];

/** Legend of the slot highlighting: full match cell, then the muted stripe. */
export function StripeLegend() {
  return (
    <Group gap="md">
      <Group gap={6}>
        <span
          style={{
            width: 18,
            height: 14,
            borderRadius: 3,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--mantine-color-green-9)',
            color: 'var(--mantine-color-green-3)',
          }}
        >
          <IconCheck size={11} stroke={3} />
        </span>
        <Text size="xs">tout le monde est dispo</Text>
      </Group>
      <Text size="xs" c="dimmed">
        · Liseré :
      </Text>
      {STRIPES.map((i) => (
        <Group key={i.label} gap={6}>
          <span
            style={{ width: 4, height: 14, borderRadius: 2, background: i.color, opacity: 0.5 }}
          />
          <Text size="xs">{i.label}</Text>
        </Group>
      ))}
      <Text size="xs" c="dimmed">
        · Survolez un créneau pour le détail.
      </Text>
    </Group>
  );
}
