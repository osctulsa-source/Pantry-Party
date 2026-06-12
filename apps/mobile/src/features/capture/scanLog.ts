/**
 * scanLog — on-device capture-accuracy groundwork.
 *
 * Every scan records {barcode, hit} so the ≥90% capture gate (H2 roadmap)
 * gets real numbers from real testing. Per-household, capped, on-device —
 * the same lightweight pattern as expiryEvents/cookLog.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CAP = 500;

interface ScanEvent {
  at: string;
  barcode: string;
  hit: boolean;
}

const keyFor = (householdId: string) => `scanLog:${householdId}`;

export async function recordScan(
  householdId: string | null,
  barcode: string,
  hit: boolean,
): Promise<void> {
  if (!householdId) return;
  try {
    const key = keyFor(householdId);
    const raw = await AsyncStorage.getItem(key);
    const events: ScanEvent[] = raw ? (JSON.parse(raw) as ScanEvent[]) : [];
    events.push({ at: new Date().toISOString(), barcode, hit });
    await AsyncStorage.setItem(key, JSON.stringify(events.slice(-CAP)));
  } catch {
    // Telemetry must never break capture.
  }
}
