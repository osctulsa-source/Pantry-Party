import { describe, expect, it, vi } from 'vitest';
import { fanOutAnnouncement } from './fanOut.js';
import type { PushSender, PushResult } from './expoClient.js';

function fakeSender(results: PushResult[] = []): { sender: PushSender; sent: any[] } {
  const sent: any[] = [];
  return {
    sent,
    sender: {
      async send(messages) {
        sent.push(...messages);
        return results.length ? results : messages.map((m) => ({ to: m.to, ok: true, deviceNotRegistered: false }));
      },
    },
  };
}

// Minimal pg stub: queue query results in call order.
function fakePg(queue: any[][]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  return {
    calls,
    client: {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return { rows: queue.shift() ?? [], rowCount: 0 };
      }),
    },
  };
}

const row = {
  id: 'a1',
  household_id: 'h1',
  kind: 'shopping_run' as const,
  created_by: 'user-1',
  message: 'Grabbing Kroger',
  departs_at: new Date(Date.now() + 1_800_000).toISOString(), // 30 min from now
};

describe('fanOutAnnouncement', () => {
  it('pushes to every member except the sender', async () => {
    const { sender, sent } = fakeSender();
    const { client } = fakePg([
      // members
      [{ user_id: 'user-1', display_name: 'Sam' }, { user_id: 'user-2', display_name: 'Alex' }],
      // tokens for user-2:
      [{ token: 'ExponentPushToken[abc]', user_id: 'user-2' }],
    ]);
    await fanOutAnnouncement(row, { pg: client as any, sender });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('ExponentPushToken[abc]');
    expect(sent[0].title).toContain('Sam');
    expect(sent[0].body).toBe('Grabbing Kroger');
  });

  it('tombstones tokens reported DeviceNotRegistered', async () => {
    const { sender } = fakeSender([
      { to: 'ExponentPushToken[dead]', ok: false, deviceNotRegistered: true },
    ]);
    const { client, calls } = fakePg([
      [{ user_id: 'user-1', display_name: 'Sam' }, { user_id: 'user-2', display_name: 'Alex' }],
      [{ token: 'ExponentPushToken[dead]', user_id: 'user-2' }],
    ]);
    await fanOutAnnouncement(row, { pg: client as any, sender });
    const tombstone = calls.find((c) => /UPDATE push_tokens SET deleted/i.test(c.sql));
    expect(tombstone).toBeTruthy();
  });

  it('no-ops when the sender is the only member', async () => {
    const { sender, sent } = fakeSender();
    const { client } = fakePg([[{ user_id: 'user-1', display_name: 'Sam' }]]);
    await fanOutAnnouncement(row, { pg: client as any, sender });
    expect(sent).toHaveLength(0);
  });

  it('skips stale runs (departs more than 1 hour ago)', async () => {
    const stale = { ...row, departs_at: new Date(Date.now() - 3_600_001).toISOString() };
    const { sender, sent } = fakeSender();
    const { client } = fakePg([]);
    await fanOutAnnouncement(stale, { pg: client as any, sender });
    expect(sent).toHaveLength(0);
  });
});
