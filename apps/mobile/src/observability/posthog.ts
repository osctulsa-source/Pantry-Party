/**
 * PostHog — product analytics client for the mobile app.
 *
 * Mirrors sentry.ts: EXPO_PUBLIC_POSTHOG_API_KEY unset = disabled (app runs
 * normally). Prefer the singleton `posthog` for fire-and-forget capture from
 * non-React code (e.g. track()); use PostHogProvider + usePostHog in UI.
 *
 * Privacy: identify with Supabase user id only — no email/PII in person props.
 */
import React from 'react';
import PostHog, { PostHogProvider } from 'posthog-react-native';

const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

if (!apiKey) {
  console.log('[posthog] EXPO_PUBLIC_POSTHOG_API_KEY unset — product analytics disabled');
}

/** Null when the project token is missing; capture helpers no-op. */
export const posthog: PostHog | null = apiKey
  ? new PostHog(apiKey, {
      host,
      // Keep lifecycle events; screen views are manual (React Navigation v7).
      captureAppLifecycleEvents: true,
    })
  : null;

/** Fire-and-forget capture for non-React call sites. Never throws. */
export function capturePostHog(
  event: string,
  properties?: Record<string, string | number | boolean>,
): void {
  try {
    posthog?.capture(event, properties);
  } catch {
    // Telemetry must never break a user flow.
  }
}

export function identifyPostHog(userId: string): void {
  try {
    posthog?.identify(userId);
  } catch {
    // ignore
  }
}

export function resetPostHog(): void {
  try {
    posthog?.reset();
  } catch {
    // ignore
  }
}

/** Record a screen view (React Navigation v7 — autocapture screens is off). */
export function screenPostHog(
  screenName: string,
  properties?: Record<string, string | number | boolean>,
): void {
  try {
    posthog?.screen(screenName, properties);
  } catch {
    // ignore
  }
}

interface PostHogAppProviderProps {
  children: React.ReactNode;
}

/**
 * Wraps the tree with PostHogProvider when configured. Place as a child of
 * NavigationContainer. Autocapture screens are off — React Navigation v7 needs
 * manual screen() via navigation onStateChange (see App.tsx).
 */
export function PostHogAppProvider({ children }: PostHogAppProviderProps) {
  if (!posthog) {
    return React.createElement(React.Fragment, null, children);
  }

  return React.createElement(
    PostHogProvider,
    {
      children,
      client: posthog,
      autocapture: {
        captureScreens: false,
        captureTouches: false,
      },
    },
    children,
  );
}
