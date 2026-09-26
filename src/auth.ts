import NextAuth from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Google from 'next-auth/providers/google';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';

const env = process.env;

// Same variable names as our other apps; the AUTH_* names still work.
const google = {
  clientId: env.GOOGLE_CLIENT_ID || env.AUTH_GOOGLE_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET || env.AUTH_GOOGLE_SECRET,
};
const microsoft = {
  clientId: env.MICROSOFT_CLIENT_ID || env.AUTH_MICROSOFT_ENTRA_ID_ID,
  clientSecret: env.MICROSOFT_CLIENT_SECRET || env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
  // A single-tenant app registration must use its tenant endpoint: the
  // /common endpoint is rejected by Microsoft (AADSTS50194).
  issuer: env.MICROSOFT_TENANT_ID
    ? `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/v2.0`
    : env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ||
      'https://login.microsoftonline.com/common/v2.0',
};

// Only enable the providers whose credentials are configured, so the app keeps
// working (and the login page only shows usable buttons) while they're missing.
const providers: Provider[] = [];
if (google.clientId && google.clientSecret) {
  providers.push(Google({ clientId: google.clientId, clientSecret: google.clientSecret }));
}
if (microsoft.clientId && microsoft.clientSecret) {
  providers.push(
    MicrosoftEntraID({
      clientId: microsoft.clientId,
      clientSecret: microsoft.clientSecret,
      issuer: microsoft.issuer,
    }),
  );
}

export const enabledProviders = providers.map((p) => {
  const cfg = typeof p === 'function' ? p() : p;
  return { id: cfg.id, name: cfg.id === 'microsoft-entra-id' ? 'Microsoft' : cfg.name };
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers,
  session: { strategy: 'database' },
  pages: { signIn: '/' },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
