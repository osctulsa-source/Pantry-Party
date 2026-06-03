import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../data/supabase/client';
import { connectPowerSync, disconnectAndClearPowerSync } from '../../data/powersync/db';

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
function syncPowerSyncWithSession(session: Session | null): void {
  if (session) {
    void connectPowerSync().catch((e: unknown) => {
      console.error('PowerSync connect failed:', e);
    });
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
