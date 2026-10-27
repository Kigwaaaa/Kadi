type RateLimitRecord = {
  count: number;
  resetAt: number;
};

export function createFeedbackRateLimiter(
  limit = 5,
  windowMs = 60 * 60 * 1000,
) {
  const records = new Map<string, RateLimitRecord>();

  return (key: string, now = Date.now()): boolean => {
    if (records.size > 10_000) {
      for (const [recordKey, record] of records) {
        if (record.resetAt <= now) records.delete(recordKey);
      }
    }

    const current = records.get(key);
    if (!current || current.resetAt <= now) {
      records.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (current.count >= limit) return false;

    current.count += 1;
    return true;
  };
}
