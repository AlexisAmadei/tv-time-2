// The ONE supabase-js client for the whole app (AC2 / ARCH-2).
//
// Every feature imports `supabase` from here — never call createClient again
// elsewhere. Config comes from Expo's EXPO_PUBLIC_* env convention: only vars
// prefixed EXPO_PUBLIC_ are exposed to client code. Copy app/.env.example to
// app/.env (untracked) and fill in the values — see supabase/README.md.

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Missing config is reported through checkSupabaseHealth() (run from App on
// startup), not thrown here. A top-level throw fires during import — before App
// can render — so a missing app/.env would redbox instead of surfacing through
// the app's health-error UI (the same UI that already handles a *wrong* key).
const missingConfig = !supabaseUrl || !supabaseAnonKey;

// createClient rejects an empty url/key, so fall back to inert placeholders when
// config is absent; checkSupabaseHealth() throws a clear message first, so this
// client is never used for a real request while misconfigured.
export const supabase = createClient(supabaseUrl || 'http://localhost', supabaseAnonKey || 'anon-key-missing', {
  auth: {
    // React Native has no localStorage — persist the session in AsyncStorage.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL-based session detection on native (that's a web-only OAuth concern).
    detectSessionInUrl: false,
  },
});

const HEALTH_TIMEOUT_MS = 5000;

/**
 * Confirm the app can actually reach the Supabase stack through the Kong
 * gateway. Probes GoTrue's health endpoint with the anon key (the same URL +
 * key the client is configured with), so a misconfigured key or a stack that
 * isn't running fails loudly here instead of silently 401-ing later.
 *
 * Resolves to the HTTP status on success; throws with an actionable message on
 * failure — including a bounded timeout so a host that accepts the connection
 * but never responds fails loudly rather than hanging forever.
 */
export async function checkSupabaseHealth(): Promise<number> {
  if (missingConfig) {
    throw new Error(
      'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Copy app/.env.example to app/.env and fill it in (see supabase/README.md).',
    );
  }
  const url = `${supabaseUrl}/auth/v1/health`;
  // React Native's fetch/AbortSignal polyfill does not implement the static
  // AbortSignal.timeout(), so build the bounded timeout from AbortController —
  // otherwise a missing runtime capability would masquerade as "stack down".
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, HEALTH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { apikey: supabaseAnonKey! },
      signal: controller.signal,
    });
  } catch (err) {
    const cause = err as Error;
    const reason = timedOut ? `no response within ${HEALTH_TIMEOUT_MS}ms` : cause.message;
    throw new Error(
      `Cannot reach Supabase at ${supabaseUrl} (${reason}). ` +
        `Start the local stack: cd supabase && docker compose up -d.`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(
      `Supabase gateway returned HTTP ${res.status} for ${url}. ` +
        (res.status === 401
          ? 'The anon key is not accepted — regenerate the stack keys (node supabase/scripts/generate-keys.mjs) and copy ANON_KEY into app/.env.'
          : 'Check that all six services are healthy (docker compose ps).'),
    );
  }
  return res.status;
}
