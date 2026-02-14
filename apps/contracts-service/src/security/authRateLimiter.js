const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

/**
 * Sliding-window in-memory limiter for authentication endpoints.
 * It is intentionally simple and side-effect free so callers can unit-test behavior.
 */
export function createAuthRateLimiter(options = {}) {
  const maxAttempts = normalizePositiveInteger(options.maxAttempts, DEFAULT_MAX_ATTEMPTS);
  const windowMs = normalizePositiveInteger(options.windowMs, DEFAULT_WINDOW_MS);
  const now = options.now || Date.now;
  const buckets = new Map();

  function ensureAllowed(key) {
    const bucket = getBucket(buckets, key, now(), windowMs);
    if (bucket.attempts >= maxAttempts) {
      throw new Error("Too many authentication attempts. Please retry later.");
    }
    bucket.attempts += 1;
  }

  function clear(key) {
    buckets.delete(key);
  }

  return { ensureAllowed, clear };
}

function getBucket(buckets, key, timestamp, windowMs) {
  const normalizedKey = String(key || "").trim() || "anonymous";
  const current = buckets.get(normalizedKey);
  if (!current || current.resetAt <= timestamp) {
    const fresh = {
      attempts: 0,
      resetAt: timestamp + windowMs
    };
    buckets.set(normalizedKey, fresh);
    return fresh;
  }
  return current;
}

function normalizePositiveInteger(value, fallback) {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}
