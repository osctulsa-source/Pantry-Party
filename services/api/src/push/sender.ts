import { createExpoSender, type PushSender } from './expoClient.js';

let instance: PushSender | null = null;

/** Lazy singleton so route + sweep share one Expo client. */
export function getPushSender(): PushSender {
  if (!instance) instance = createExpoSender();
  return instance;
}
