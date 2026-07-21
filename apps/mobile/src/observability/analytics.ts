/**
 * analytics — minimal, privacy-first product-funnel telemetry.
 *
 * Fire-and-forget: track() best-effort INSERTs one row into Supabase's
 * append-only `analytics_events` table and dual-writes to PostHog when
 * configured. NEVER throws — telemetry must not break a user flow (same
 * contract as scanLog). No PII: an anonymous per-install uuid (AsyncStorage)
 * + the authenticated user id (for prod RLS) + the event name + a small JSON
 * prop bag. No offline outbox yet: events that fail to send (offline, or table
 * absent in dev) are dropped, which is acceptable for early funnel measurement.
 * Measures the install → first-match funnel.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import { supabase } from '../data/supabase/client';
import { capturePostHog } from './posthog';

export type AnalyticsEvent =
  | 'onboarding_started'
  | 'staples_seeded'
  | 'first_match_shown'
  | 'recipe_opened'
  | 'cook_this_confirmed';

const INSTALL_ID_KEY = 'analytics:installId';
let cachedInstallId: string | null = null;

/** Stable anonymous per-install id; cached in-memory after first read. */
export async function getInstallId(): Promise<string> {
  if (cachedInstallId) return cachedInstallId;
  try {
    const existing = await AsyncStorage.getItem(INSTALL_ID_KEY);
    if (existing) {
      cachedInstallId = existing;
      return existing;
    }
  } catch {
    // fall through and mint a fresh id
  }
  const fresh = Crypto.randomUUID();
  cachedInstallId = fresh;
  try {
    await AsyncStorage.setItem(INSTALL_ID_KEY, fresh);
  } catch {
    // Non-fatal: worst case a new id next launch.
  }
  return fresh;
}

/** Fire-and-forget funnel event. Never throws. Call as `void track(...)`. */
export async function track(
  event: AnalyticsEvent,
  props: Record<string, string | number | boolean> = {},
): Promise<void> {
  try {
    const [installId, sessionRes] = await Promise.all([
      getInstallId(),
      supabase.auth.getSession(),
    ]);
    const userId = sessionRes.data.session?.user?.id ?? null;
    capturePostHog(event, { ...props, install_id: installId });
    await supabase.from('analytics_events').insert({
      id: Crypto.randomUUID(),
      install_id: installId,
      user_id: userId,
      event,
      props,
      occurred_at: new Date().toISOString(),
    });
  } catch {
    // Telemetry must never break a user flow.
  }
}
