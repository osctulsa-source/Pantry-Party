/**
 * Drains one PowerSync CRUD transaction to the upload API without ever
 * wedging the queue.
 *
 * PowerSync retries a transaction until uploadData() stops throwing. That is
 * right for outages, but a write the server will NEVER accept (it fails a
 * tenancy check, targets a row that no longer exists, violates a constraint)
 * used to be retried forever — and because the queue is strictly ordered,
 * every later write from the device silently stayed local behind it.
 *
 * Rule: transient failures throw (retry later); permanent rejections are
 * dropped and reported, and the queue moves on. When a multi-op transaction
 * is rejected, the ops are replayed one at a time so only the offending op is
 * lost — replays are safe because the server's PUT/PATCH are idempotent.
 */

export interface UploadOp {
  op: string;
  type: string;
  id: string;
  [key: string]: unknown;
}

export interface UploadResponse {
  status: number;
  body: string;
}

export type SendOps = (ops: UploadOp[]) => Promise<UploadResponse>;
export type OnDropped = (op: UploadOp, response: UploadResponse) => void;

/**
 * True when retrying the identical request can never succeed. 401 (token
 * refresh), 408 and 429 (try later) are 4xx but transient.
 */
export function isPermanentRejection(status: number): boolean {
  if (status < 400 || status >= 500) return false;
  return status !== 401 && status !== 408 && status !== 429;
}

function isOk(status: number): boolean {
  return status >= 200 && status < 300;
}

function transientError(response: UploadResponse): Error {
  return new Error(`Upload failed: HTTP ${response.status} ${response.body}`);
}

/**
 * Resolves when every op is either applied or permanently dropped (the caller
 * may then complete the transaction). Throws when anything should be retried.
 */
export async function drainTransaction(
  ops: UploadOp[],
  send: SendOps,
  onDropped: OnDropped,
): Promise<void> {
  if (ops.length === 0) return;

  const whole = await send(ops);
  if (isOk(whole.status)) return;
  if (!isPermanentRejection(whole.status)) throw transientError(whole);

  const [only] = ops;
  if (ops.length === 1 && only) {
    onDropped(only, whole);
    return;
  }

  // The server applies a batch atomically, so nothing landed. Replay in order,
  // one op per request, dropping only what the server permanently refuses.
  for (const op of ops) {
    const single = await send([op]);
    if (isOk(single.status)) continue;
    if (!isPermanentRejection(single.status)) throw transientError(single);
    onDropped(op, single);
  }
}
