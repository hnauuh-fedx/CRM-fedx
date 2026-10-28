import { requiresRedis, type RedisFeatures } from "./redis-features";

export async function checkReadiness(dependencies: { database: () => Promise<unknown>; redis: (() => Promise<unknown>) | null; features: RedisFeatures }, timeoutMs = 3000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all([
        dependencies.database(),
        requiresRedis(dependencies.features) ? (dependencies.redis ? dependencies.redis().then(result => { if (result !== "PONG") throw new Error("Redis did not respond to PING"); }) : Promise.reject(new Error("Redis required but disabled"))) : Promise.resolve(),
      ]),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Readiness timeout")), timeoutMs); }),
    ]);
    return true;
  } catch { return false; }
  finally { clearTimeout(timer); }
}
