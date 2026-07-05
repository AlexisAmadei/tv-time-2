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
    // onAuthStateChange can fire (e.g. a sign-in completing) before the initial
    // getSession() lookup resolves; once that happens, the session is live and
    // getSession()'s eventually-stale result must not overwrite it.
    let live = false;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted || live) return;
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted || live) return;
        setLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      live = true;
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

/** Sign the current user out (clears the persisted session). Used directly as a
 * `Pressable` `onPress`, so swallow (log) failures rather than letting them
 * surface as an unhandled rejection. */
export async function signOut(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('signOut failed:', err);
  }
}

/** Client-side @username rule — mirrors the DB check constraint (0001_profiles.sql). */
export const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;
