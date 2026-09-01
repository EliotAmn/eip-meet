import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import './globals.css';

import type { Metadata } from 'next';
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { theme } from '@/theme';

export const metadata: Metadata = {
  title: 'LogiMeet',
  description: 'Trouvez un créneau qui va à toute votre équipe, fuseaux horaires gérés.',
  openGraph: {
    title: 'LogiMeet',
    description: 'Trouvez un créneau qui va à toute votre équipe, fuseaux horaires gérés.',
    siteName: 'LogiMeet',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="auto">
          <Notifications position="top-right" />
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
