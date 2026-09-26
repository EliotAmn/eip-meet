'use client';

import { createTheme } from '@mantine/core';
// French month / weekday names for @mantine/dates pickers (client bundle).
import 'dayjs/locale/fr';

// Keep to Mantine's built-in palette and scales - no hand-rolled colors.
export const theme = createTheme({
  primaryColor: 'indigo',
  defaultRadius: 'md',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  headings: {
    fontWeight: '650',
  },
});
