import { Group, Text } from '@mantine/core';

const ITEMS = [
  { color: 'var(--mantine-color-green-6)', label: 'tout le monde' },
  { color: 'var(--mantine-color-yellow-5)', label: 'tout le monde (dont « si besoin »)' },
  { color: 'var(--mantine-color-orange-6)', label: 'il manque 1 personne' },
  { color: 'var(--mantine-color-red-6)', label: 'il en manque plus' },
];

/** Legend of the aggregate stripe drawn on the left of each slot. */
export function StripeLegend() {
  return (
    <Group gap="md">
      <Text size="xs" c="dimmed">
        Liseré :
      </Text>
      {ITEMS.map((i) => (
        <Group key={i.label} gap={6}>
          <span style={{ width: 4, height: 14, borderRadius: 2, background: i.color }} />
          <Text size="xs">{i.label}</Text>
        </Group>
      ))}
      <Text size="xs" c="dimmed">
        · Survolez un créneau pour le détail.
      </Text>
    </Group>
  );
}
