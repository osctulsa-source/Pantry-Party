import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../data/supabase/client';
import {
  connectPowerSync,
  disconnectAndClearPowerSync,
  getPowerSync,
} from '../../data/powersync/db';
import { capturePostHog, identifyPostHog, resetPostHog } from '../../observability/posthog';
import { ensureDefaultHousehold } from '../household/ensureDefaultHousehold';

export type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; session: Session };

interface AuthContextValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  // Sends a recovery email containing a 6-digit OTP code.
  requestPasswordReset: (email: string) => Promise<{ error?: string }>;
  // Verifies the emailed OTP (type 'recovery') and then sets the new password.
  // On success Supabase establishes a session, so AuthContext flips to
  // 'authenticated' and the app drops the user straight into the pantry.
  confirmPasswordReset: (
    email: string,
    token: string,
    newPassword: string,
  ) => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Drives the PowerSync connect/disconnect lifecycle off Supabase auth events.
// connectPowerSync is idempotent; disconnectAndClearPowerSync wipes local SQLite
// so the next user on the same install starts clean (critical for multi-user
// smoke testing on a single simulator).
//
// On sign-in we also run ensureDefaultHousehold() so first-time users get a
// pantry to write into without manual SQL provisioning. It MUST run after
// waitForFirstSync() so the local user_households cache reflects server state —
// otherwise a returning user whose membership hasn't replicated yet would get
// a duplicate household. See features/household/ensureDefaultHousehold.ts.
//
// `bootstrap` gates that household provisioning to genuine sign-in / app-load
// only. onAuthStateChange also fires on TOKEN_REFRESHED / USER_UPDATED, where
// re-running waitForFirstSync + ensureDefaultHousehold is pure waste — connect
// is idempotent, so those events still keep the connection alive but skip the
// bootstrap.
function syncPowerSyncWithSession(
  session: Session | null,
  opts: { bootstrap: boolean },
): void {
  if (session) {
    void (async () => {
      try {
        await connectPowerSync();
        if (opts.bootstrap) {
          await getPowerSync().waitForFirstSync();
          await ensureDefaultHousehold(session.user.id);
        }
      } catch (e: unknown) {
        console.error('PowerSync connect / household bootstrap failed:', e);
      }
    })();
  } else {
    void disconnectAndClearPowerSync().catch((e: unknown) => {
      console.error('PowerSync disconnect/clear failed:', e);
    });
  }
}

/** Identify with user id only (no email/PII); reset on sign-out. */
function syncPostHogWithSession(session: Session | null): void {
  if (session) {
    identifyPostHog(session.user.id);
  } else {
    resetPostHog();
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      // App load: if a session is already present, this is effectively a
      // (re-)sign-in for a returning user, so run the bootstrap.
      syncPowerSyncWithSession(session, { bootstrap: Boolean(session) });
      syncPostHogWithSession(session);
      setState(session ? { status: 'authenticated', session } : { status: 'unauthenticated' });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Only genuine sign-ins provision a household; TOKEN_REFRESHED /
      // USER_UPDATED keep the connection alive but skip the bootstrap.
      syncPowerSyncWithSession(session, { bootstrap: event === 'SIGNED_IN' });
      syncPostHogWithSession(session);
      setState(session ? { status: 'authenticated', session } : { status: 'unauthenticated' });
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) capturePostHog('user_signed_in', { method: 'password' });
    return error ? { error: error.message } : {};
  };

  const signUp: AuthContextValue['signUp'] = async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (!error) capturePostHog('user_signed_up', { method: 'password' });
    return error ? { error: error.message } : {};
  };

  const signOut: AuthContextValue['signOut'] = async () => {
    await supabase.auth.signOut();
  };

  const requestPasswordReset: AuthContextValue['requestPasswordReset'] = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return error ? { error: error.message } : {};
  };

  const confirmPasswordReset: AuthContextValue['confirmPasswordReset'] = async (
    email,
    token,
    newPassword,
  ) => {
    // Exchange the emailed OTP for a recovery session...
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'recovery',
    });
    if (verifyError) return { error: verifyError.message };
    // ...then set the new password on the now-authenticated user.
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    return updateError ? { error: updateError.message } : {};
  };

  return (
    <AuthContext.Provider
      value={{ state, signIn, signUp, signOut, requestPasswordReset, confirmPasswordReset }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
