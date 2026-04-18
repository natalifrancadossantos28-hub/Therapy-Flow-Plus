import { upsertTriagem, type TriagemInput } from "./triagem-rpc";

const OFFLINE_QUEUE_KEY = "nfs_triagem_offline_queue";

type OfflineItem = { id: string; data: TriagemInput; createdAt: string; attempts: number };

export async function processOfflineQueue(): Promise<number> {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return 0;
    const queue: OfflineItem[] = JSON.parse(raw);
    if (!queue.length) return 0;

    const remaining: OfflineItem[] = [];
    let synced = 0;
    for (const item of queue) {
      try {
        await upsertTriagem(null, item.data);
        synced++;
      } catch {
        remaining.push({ ...item, attempts: item.attempts + 1 });
      }
    }
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
    return synced;
  } catch {
    return 0;
  }
}

export function addToOfflineQueue(data: TriagemInput): void {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue: OfflineItem[] = raw ? JSON.parse(raw) : [];
    queue.push({ id: Date.now().toString(), data, createdAt: new Date().toISOString(), attempts: 0 });
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch { /* ignore */ }
}

export function getOfflineQueueCount(): number {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue: OfflineItem[] = raw ? JSON.parse(raw) : [];
    return queue.length;
  } catch { return 0; }
}
