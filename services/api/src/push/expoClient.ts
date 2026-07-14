/**
 * Thin wrapper over expo-server-sdk. The fan-out module depends only on the
 * PushSender interface, so tests inject a recorder and no network is touched.
 * DeviceNotRegistered tickets are surfaced so the caller can tombstone tokens.
 */
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk';

export interface PushSend {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushResult {
  to: string;
  ok: boolean;
  /** true when Expo reports the token is no longer registered. */
  deviceNotRegistered: boolean;
}

export interface PushSender {
  send(messages: PushSend[]): Promise<PushResult[]>;
}

export function isExpoPushToken(token: string): boolean {
  return Expo.isExpoPushToken(token);
}

export function createExpoSender(): PushSender {
  const expo = new Expo();
  return {
    async send(messages) {
      const valid = messages.filter((m) => Expo.isExpoPushToken(m.to));
      const expoMessages: ExpoPushMessage[] = valid.map((m) => ({
        to: m.to,
        title: m.title,
        body: m.body,
        data: m.data,
        sound: 'default',
      }));
      const results: PushResult[] = [];
      for (const chunk of expo.chunkPushNotifications(expoMessages)) {
        let tickets: ExpoPushTicket[] = [];
        try {
          tickets = await expo.sendPushNotificationsAsync(chunk);
        } catch (err) {
          console.error('[push] chunk send failed:', err);
        }
        chunk.forEach((msg, i) => {
          const ticket = tickets[i];
          const ok = ticket?.status === 'ok';
          const dnr =
            ticket?.status === 'error' &&
            ticket.details?.error === 'DeviceNotRegistered';
          results.push({ to: String(msg.to), ok, deviceNotRegistered: Boolean(dnr) });
        });
      }
      return results;
    },
  };
}
