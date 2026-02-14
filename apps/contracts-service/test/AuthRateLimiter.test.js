import test from "node:test";
import assert from "node:assert/strict";

import { createAuthRateLimiter } from "../src/security/authRateLimiter.js";

test("auth limiter blocks repeated attempts within window", () => {
  let now = 1_000;
  const limiter = createAuthRateLimiter({
    maxAttempts: 2,
    windowMs: 100,
    now: () => now
  });

  limiter.ensureAllowed("key");
  limiter.ensureAllowed("key");
  assert.throws(() => limiter.ensureAllowed("key"), /Too many authentication attempts/);

  now = 1_101;
  assert.doesNotThrow(() => limiter.ensureAllowed("key"));
});

test("auth limiter clear resets attempt counter", () => {
  const limiter = createAuthRateLimiter({
    maxAttempts: 1,
    windowMs: 1_000
  });

  limiter.ensureAllowed("key");
  limiter.clear("key");
  assert.doesNotThrow(() => limiter.ensureAllowed("key"));
});
