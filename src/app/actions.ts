'use server';

import { signIn, signOut } from '@/auth';

export async function signInWith(providerId: string, redirectTo: string) {
  // Only allow same-site paths as a post-login destination.
  const safe = redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/';
  await signIn(providerId, { redirectTo: safe });
}

export async function signOutAction() {
  await signOut({ redirectTo: '/' });
}
