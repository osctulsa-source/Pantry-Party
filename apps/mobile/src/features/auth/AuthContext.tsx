import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../data/supabase/client';
import {
  connectPowerSync,
  disconnectAndClearPowerSync,
  getPowerSync,
} from '../../data/powersync/db';
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
function syncPowerSyncWithSession(session: Session | null): void {
  if (session) {
    void (async () => {
      try {
        await connectPowerSync();
        await getPowerSync().waitForFirstSync();
        await ensureDefaultHousehold(session.user.id);
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      syncPowerSyncWithSession(session);
      setState(session ? { status: 'authenticated', session } : { status: 'unauthenticated' });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      syncPowerSyncWithSession(session);
      setState(session ? { status: 'authenticated', session } : { status: 'unauthenticated' });
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  };

  const signUp: AuthContextValue['signUp'] = async (email, password) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return error ? { error: error.message } : {};
  };

  const signOut: AuthContextValue['signOut'] = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ state, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
