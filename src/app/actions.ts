'use server';

import { signIn, signOut } from '@/auth';

export async function signInWith(providerId: string) {
  await signIn(providerId, { redirectTo: '/' });
}

export async function signOutAction() {
  await signOut({ redirectTo: '/' });
}
