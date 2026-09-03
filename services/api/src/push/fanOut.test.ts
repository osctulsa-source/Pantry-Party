import { describe, expect, it, vi } from 'vitest';
import { fanOutAnnouncement, sweepRunnerSummaries } from './fanOut.js';
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

// A pg stub that models the atomic claim: the candidate SELECT always returns
// the due run (so both callers see it), but the `... WHERE runner_summary_sent_at
// IS NULL` claim UPDATE returns rowCount 1 only for the first caller.
function claimAwarePg() {
  let claimed = false;
  const candidate = {
    id: 'run-1',
    household_id: 'h1',
    created_by: 'user-1',
    departs_at: new Date().toISOString(), // delta 0 → due
    status: 'active',
    runner_summary_sent_at: null,
    requested_count: 3,
    housemate_count: 1,
  };
  return {
    client: {
      query: vi.fn(async (sql: string) => {
        if (/UPDATE announcements SET runner_summary_sent_at/i.test(sql)) {
          if (claimed) return { rows: [], rowCount: 0 };
          claimed = true;
          return { rows: [], rowCount: 1 };
        }
        if (/FROM announcements a/i.test(sql)) return { rows: [candidate], rowCount: 1 };
        if (/FROM push_tokens/i.test(sql)) {
          return { rows: [{ token: 'ExponentPushToken[x]' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
    },
  };
}

describe('sweepRunnerSummaries', () => {
  it('sends the runner ping at most once under a simulated two-caller race', async () => {
    const { sender, sent } = fakeSender();
    const { client } = claimAwarePg();
    const now = new Date();
    // Two instances sweep the same due run concurrently.
    await Promise.all([
      sweepRunnerSummaries({ pg: client as any, sender }, now),
      sweepRunnerSummaries({ pg: client as any, sender }, now),
    ]);
    // Claim-first means exactly one caller wins and sends; the other skips.
    expect(sent).toHaveLength(1);
  });
});
