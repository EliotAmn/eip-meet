'use client';

import { CopyButton, Button, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';

export function CopyLinkButton({
  value,
  label = 'Copier le lien',
  size = 'xs',
  variant = 'light',
  fullWidth = false,
}: {
  value: string;
  label?: string;
  size?: string;
  variant?: string;
  fullWidth?: boolean;
}) {
  return (
    <CopyButton value={value} timeout={1500}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? 'Copié !' : value} withArrow openDelay={300}>
          <Button
            size={size}
            variant={copied ? 'filled' : variant}
            color={copied ? 'teal' : undefined}
            onClick={copy}
            fullWidth={fullWidth}
            leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
          >
            {copied ? 'Copié' : label}
          </Button>
        </Tooltip>
      )}
    </CopyButton>
  );
}
