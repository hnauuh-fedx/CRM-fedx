export type WorkerHeartbeat = { queue: string; instance: string; commit: string; at: number; healthy: boolean; completed: number; failed: number; stalled: number; lastSuccessAt: number | null; lastFailureAt: number | null; lastDurationMs: number | null };
export function heartbeatPrefix(environment: string, queue: string) { return `crm:operations:${environment}:heartbeat:${queue}:`; }
export function heartbeatIndex(environment: string, queue: string) { return `crm:operations:${environment}:workers:${queue}`; }
