import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import './globals.css';

import type { Metadata } from 'next';
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import 'dayjs/locale/fr';
import { theme } from '@/theme';
import { APP_NAME } from '@/lib/brand';

export const metadata: Metadata = {
  title: APP_NAME,
  description: 'Trouvez un créneau qui va à toute votre équipe, fuseaux horaires gérés.',
  openGraph: {
    title: APP_NAME,
    description: 'Trouvez un créneau qui va à toute votre équipe, fuseaux horaires gérés.',
    siteName: APP_NAME,
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
          <DatesProvider settings={{ locale: 'fr', firstDayOfWeek: 1 }}>
            <Notifications position="top-right" />
            {children}
          </DatesProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
