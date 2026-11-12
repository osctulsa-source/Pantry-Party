import {
  drainTransaction,
  isPermanentRejection,
  type UploadOp,
  type UploadResponse,
} from './uploadQueue';

const op = (id: string): UploadOp => ({ op: 'PUT', type: 'pantry_items', id });
const ok: UploadResponse = { status: 200, body: '' };
const res = (status: number): UploadResponse => ({ status, body: `err ${status}` });

/** A fake server: rejects any request containing an id listed in `bad`. */
function server(bad: Record<string, number>) {
  const calls: string[][] = [];
  const send = jest.fn(async (ops: UploadOp[]) => {
    calls.push(ops.map((o) => o.id));
    const offender = ops.find((o) => bad[o.id] !== undefined);
    return offender ? res(bad[offender.id] as number) : ok;
  });
  return { send, calls };
}

describe('isPermanentRejection', () => {
  it.each([400, 403, 404, 409, 410, 413, 422])('%i is permanent', (s) => {
    expect(isPermanentRejection(s)).toBe(true);
  });
  it.each([200, 401, 408, 429, 500, 502, 503])('%i is not', (s) => {
    expect(isPermanentRejection(s)).toBe(false);
  });
});

describe('drainTransaction', () => {
  it('sends the whole transaction once when the server accepts it', async () => {
    const { send, calls } = server({});
    const dropped = jest.fn();
    await drainTransaction([op('a'), op('b')], send, dropped);
    expect(calls).toEqual([['a', 'b']]);
    expect(dropped).not.toHaveBeenCalled();
  });

  it('throws on a server outage so PowerSync retries — nothing is dropped', async () => {
    const { send } = server({ a: 503 });
    const dropped = jest.fn();
    await expect(drainTransaction([op('a')], send, dropped)).rejects.toThrow('HTTP 503');
    expect(dropped).not.toHaveBeenCalled();
  });

  it('throws on 401 so the upload is retried after the token refreshes', async () => {
    const { send } = server({ a: 401 });
    await expect(drainTransaction([op('a')], send, jest.fn())).rejects.toThrow('HTTP 401');
  });

  it('drops a single permanently rejected op instead of wedging the queue', async () => {
    const { send, calls } = server({ a: 403 });
    const dropped = jest.fn();
    await drainTransaction([op('a')], send, dropped);
    expect(calls).toEqual([['a']]);
    expect(dropped).toHaveBeenCalledWith(op('a'), res(403));
  });

  it('replays a rejected transaction op by op and drops only the offender', async () => {
    const { send, calls } = server({ b: 409 });
    const dropped = jest.fn();
    await drainTransaction([op('a'), op('b'), op('c')], send, dropped);
    expect(calls).toEqual([['a', 'b', 'c'], ['a'], ['b'], ['c']]);
    expect(dropped).toHaveBeenCalledTimes(1);
    expect(dropped).toHaveBeenCalledWith(op('b'), res(409));
  });

  it('a transient failure during the replay throws rather than dropping', async () => {
    let n = 0;
    const send = jest.fn(async () => {
      n += 1;
      if (n === 1) return res(400); // whole batch rejected
      if (n === 2) return ok; // op a applied
      return res(500); // outage on op b
    });
    const dropped = jest.fn();
    await expect(drainTransaction([op('a'), op('b')], send, dropped)).rejects.toThrow('HTTP 500');
    expect(dropped).not.toHaveBeenCalled();
  });

  it('does nothing for an empty transaction', async () => {
    const send = jest.fn();
    await drainTransaction([], send, jest.fn());
    expect(send).not.toHaveBeenCalled();
  });
});
