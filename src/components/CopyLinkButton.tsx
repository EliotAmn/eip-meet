'use client';

import { CopyButton, Button, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';

export function CopyLinkButton({ value, label = 'Copier le lien' }: { value: string; label?: string }) {
  return (
    <CopyButton value={value} timeout={1500}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? 'Copié !' : value} withArrow openDelay={300}>
          <Button
            size="xs"
            variant={copied ? 'filled' : 'light'}
            color={copied ? 'teal' : undefined}
            onClick={copy}
            leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          >
            {copied ? 'Copié' : label}
          </Button>
        </Tooltip>
      )}
    </CopyButton>
  );
}
