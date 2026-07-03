// The single source of auth-session state for the app (Story 1.2).
//
// Subscribes to the ONE supabase client's auth events. Session persistence to
// AsyncStorage is already configured in supabaseClient.ts, so a signed-in user
// survives an app restart — this hook just reflects that state into React.

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './supabaseClient';

export interface SessionState {
  /** The current auth session, or null when signed out. */
  session: Session | null;
  /** True until the initial session lookup resolves (avoids an auth-screen flash). */
  loading: boolean;
}

/**
 * Reflect the current Supabase auth session into React state. Reads the
 * persisted session once on mount, then stays in sync via onAuthStateChange
 * (sign-in, sign-out, token refresh).
 */
export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}

/** Sign the current user out (clears the persisted session). */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** Client-side @username rule — mirrors the DB check constraint (0001_profiles.sql). */
export const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;
