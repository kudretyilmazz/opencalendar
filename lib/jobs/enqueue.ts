import type { PgBoss, SendOptions } from "pg-boss";
import { getEnv } from "@/lib/env";
import { getProducer } from "./boss";
import { QUEUES, type QueueKey, type QueuePayload } from "./queues";

/**
 * Typed enqueue. Payloads are validated before they reach the queue so a bad producer fails at
 * the call site, not later in the worker. Pass `options.db` (pg-boss `fromDrizzle(tx, sql)`) to
 * enqueue inside the caller's transaction.
 */
export async function enqueueWith<K extends QueueKey>(
  boss: PgBoss,
  key: K,
  payload: QueuePayload<K>,
  options: SendOptions = {},
): Promise<string | null> {
  const queue = QUEUES[key];
  const data = queue.schema.parse(payload);
  return boss.send(queue.name, data, options);
}

export async function enqueue<K extends QueueKey>(
  key: K,
  payload: QueuePayload<K>,
  options?: SendOptions,
): Promise<string | null> {
  const boss = await getProducer(getEnv().DATABASE_URL);
  return enqueueWith(boss, key, payload, options);
}
