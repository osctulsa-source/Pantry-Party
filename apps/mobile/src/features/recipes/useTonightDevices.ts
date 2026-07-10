/**
 * useTonightDevices — the Cook tab's per-day "what are you cooking with?"
 * answer. AsyncStorage key includes the local date, so the choice expires
 * naturally at midnight and the prompt re-asks next day — no cleanup job.
 *
 * `answered` distinguishes "hasn't been asked today" from "answered with
 * Anything" (devices: []) — both rank identically, but only the former shows
 * the prompt card. A persistent tab can sit mounted across midnight, so the
 * screen calls refreshDay() on focus; a date roll resets to unanswered.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CookingDevice } from '@breadbox/core';

type Stored = { devices: CookingDevice[]; answered: boolean };

function localDay(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const storageKey = (householdId: string, day: string) => `cookingWith:${householdId}:${day}`;

export function useTonightDevices(householdId: string | null) {
  const [devices, setDevicesState] = useState<CookingDevice[]>([]);
  const [answered, setAnswered] = useState(false);
  const [day, setDay] = useState(localDay);

  useEffect(() => {
    let cancelled = false;
    setDevicesState([]);
    setAnswered(false);
    if (!householdId) return;
    AsyncStorage.getItem(storageKey(householdId, day))
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          const parsed = JSON.parse(raw) as Stored;
          setDevicesState(Array.isArray(parsed.devices) ? parsed.devices : []);
          setAnswered(parsed.answered === true);
        } catch {
          // Corrupt value — treat as unanswered; next answer overwrites it.
        }
      })
      .catch(() => {});
    // Best-effort tidy-up of yesterday's key.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    AsyncStorage.removeItem(storageKey(householdId, localDay(yesterday))).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [householdId, day]);

  /** Set tonight's devices ([] = "Anything") and mark today answered. */
  const setDevices = useCallback(
    (next: CookingDevice[]) => {
      setDevicesState(next);
      setAnswered(true);
      if (householdId) {
        AsyncStorage.setItem(
          storageKey(householdId, localDay()),
          JSON.stringify({ devices: next, answered: true } satisfies Stored),
        ).catch(() => {});
      }
    },
    [householdId],
  );

  /** Dismissing the prompt = "Anything" — don't re-ask today. */
  const dismiss = useCallback(() => setDevices([]), [setDevices]);

  /** Call on tab focus: rolls `day` past midnight, which resets + reloads. */
  const refreshDay = useCallback(() => setDay(localDay()), []);

  return { devices, answered, setDevices, dismiss, refreshDay };
}
