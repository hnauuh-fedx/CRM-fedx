export function installWorkerShutdown(options: { name: string; drain: () => Promise<unknown>; close: () => Promise<unknown>; timeoutMs?: number; exit?: (code: number) => void }) {
  let closing: Promise<void> | undefined;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const shutdown = (signal: string, code = 0) => {
    closing ??= (async () => {
      console.info(JSON.stringify({ event: "worker_shutdown", worker: options.name, signal }));
      const timer = setTimeout(() => { console.error(JSON.stringify({ event: "worker_shutdown_timeout", worker: options.name })); exit(1); }, options.timeoutMs ?? 30000);
      timer.unref();
      try { await options.drain(); await options.close(); }
      catch { code = 1; }
      finally { clearTimeout(timer); exit(code); }
    })();
    return closing;
  };
  process.once("SIGINT", () => void shutdown("SIGINT")); process.once("SIGTERM", () => void shutdown("SIGTERM"));
  return shutdown;
}
