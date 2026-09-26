'use client';

import { useEffect, useState } from 'react';
import {
  Container,
  Stack,
  Title,
  Text,
  Card,
  Button,
  Alert,
  Code,
  Group,
  ThemeIcon,
  Center,
} from '@mantine/core';
import {
  IconBrandGoogle,
  IconBrandWindows,
  IconCalendarClock,
  IconInfoCircle,
} from '@tabler/icons-react';
import { signInWith } from '@/app/actions';
import { APP_NAME } from '@/lib/brand';

const PROVIDER_ICON: Record<string, React.ReactNode> = {
  google: <IconBrandGoogle size={18} />,
  'microsoft-entra-id': <IconBrandWindows size={18} />,
};

// Auth.js error codes (?error=...) -> readable message.
const AUTH_ERRORS: Record<string, string> = {
  OAuthCallbackError:
    'Le fournisseur (Google / Microsoft) a renvoyé une erreur pendant la connexion. Le détail est dans les logs du serveur (ligne « [auth][error] »).',
  OAuthAccountNotLinked:
    'Cet email est déjà utilisé par un compte créé avec un autre fournisseur. Connectez-vous avec celui-là.',
  AccessDenied: 'Accès refusé.',
  Configuration: "Erreur de configuration de l'authentification côté serveur.",
};

export function Landing({ providers }: { providers: { id: string; name: string }[] }) {
  const [error, setError] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState('/');

  useEffect(() => {
    const url = new URL(window.location.href);
    setError(url.searchParams.get('error'));
    url.searchParams.delete('error');
    setReturnTo(url.pathname + url.search);
  }, []);

  return (
    <Center mih="100dvh" p="md">
      <Container size={440} w="100%">
        <Stack gap="lg">
          <Group gap="xs">
            <ThemeIcon variant="light" size="lg" radius="md">
              <IconCalendarClock size={20} />
            </ThemeIcon>
            <Text fw={700} size="xl">
              {APP_NAME}
            </Text>
          </Group>
          <div>
            <Title order={2}>Planifier les réunions d&apos;équipe</Title>
            <Text c="dimmed" mt={4}>
              Renseignez une fois vos indisponibilités récurrentes, {APP_NAME} trouve les
              créneaux qui vont à tout le monde, quel que soit le fuseau horaire.
            </Text>
          </div>
          <Card withBorder radius="md" padding="lg">
            <Stack gap="md">
              <Text fw={600}>Connexion</Text>
              {error && (
                <Alert color="red" variant="light" title="Connexion impossible">
                  {AUTH_ERRORS[error] ?? 'La connexion a échoué.'}{' '}
                  <Text span size="xs" c="dimmed">
                    (code : {error})
                  </Text>
                </Alert>
              )}
              {providers.length === 0 ? (
                <Alert
                  color="yellow"
                  variant="light"
                  icon={<IconInfoCircle size={16} />}
                  style={{ overflowWrap: 'anywhere' }}
                >
                  Aucun fournisseur de connexion n&apos;est configuré. Renseignez{' '}
                  <Code>MICROSOFT_TENANT_ID</Code>, <Code>MICROSOFT_CLIENT_ID</Code>,{' '}
                  <Code>MICROSOFT_CLIENT_SECRET</Code> et/ou <Code>GOOGLE_CLIENT_ID</Code>,{' '}
                  <Code>GOOGLE_CLIENT_SECRET</Code> dans le <Code>.env</Code>.
                </Alert>
              ) : (
                providers.map((p) => (
                  <form key={p.id} action={signInWith.bind(null, p.id, returnTo)}>
                    <Button
                      type="submit"
                      fullWidth
                      variant="default"
                      size="md"
                      leftSection={PROVIDER_ICON[p.id]}
                    >
                      Continuer avec {p.name}
                    </Button>
                  </form>
                ))
              )}
              <Text size="xs" c="dimmed">
                Vous avez reçu un lien d&apos;invité ? Il fonctionne sans compte.
              </Text>
            </Stack>
          </Card>
        </Stack>
      </Container>
    </Center>
  );
}
