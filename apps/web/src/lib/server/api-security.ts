import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const policies = {
  create: { limit: 5, window: "1 h" },
  joinIp: { limit: 20, window: "1 h" },
  joinCode: { limit: 5, window: "1 m" },
  chatIp: { limit: 30, window: "1 m" },
  chatPlayer: { limit: 10, window: "1 m" },
  actionIp: { limit: 60, window: "1 m" },
  actionPlayer: { limit: 30, window: "1 m" },
  nikoPlayer: { limit: 3, window: "1 m" },
} as const;

type Policy = keyof typeof policies;

const limiters = new Map<Policy, Ratelimit>();

export class RateLimitUnavailableError extends Error {
  constructor() {
    super("RATE_LIMIT_UNAVAILABLE");
    this.name = "RateLimitUnavailableError";
  }
}

export async function enforceRateLimit(
  policy: Policy,
  identifier: string,
): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new RateLimitUnavailableError();

  let limiter = limiters.get(policy);
  if (!limiter) {
    const redis = new Redis({ url, token });
    const config = policies[policy];
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.limit, config.window),
      prefix: `kadi:${policy}`,
      analytics: false,
    });
    limiters.set(policy, limiter);
  }

  const result = await limiter.limit(identifier);
  if (!result.success) {
    const error = new Error("RATE_LIMITED");
    error.name = "RateLimitError";
    throw error;
  }
}
