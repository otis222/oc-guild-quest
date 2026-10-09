// 事件紀錄（企劃表 7.6）：研究模式用來算指標。全部存在 'events' 這個 key，照發生順序排。
import { EVENTS_KEY, type KV } from './storage';
import type { EventType, LogEvent } from './types';

export type EventFields = Omit<LogEvent, 't' | 'type'>;

/** 記一筆事件。同時記好幾筆也不會掉。 */
export async function logEvent(kv: KV, type: EventType, fields: EventFields = {}, now = Date.now()): Promise<LogEvent> {
  const e: LogEvent = { t: now, type, ...fields };
  await kv.update<LogEvent[]>(EVENTS_KEY, (old) => [...(old ?? []), e]);
  return e;
}

export async function loadEvents(kv: KV): Promise<LogEvent[]> {
  return (await kv.get<LogEvent[]>(EVENTS_KEY)) ?? [];
}
