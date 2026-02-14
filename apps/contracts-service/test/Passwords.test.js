import test from "node:test";
import assert from "node:assert/strict";

import { hashPassword, needsPasswordMigration, verifyPassword } from "../src/security/passwords.js";

test("password helpers hash and verify scrypt values", () => {
  const hash = hashPassword("secret123");
  assert.ok(hash.startsWith("scrypt$"));
  assert.equal(verifyPassword("secret123", hash), true);
  assert.equal(verifyPassword("wrong", hash), false);
  assert.equal(needsPasswordMigration(hash), false);
});

test("password helpers support legacy plaintext migration detection", () => {
  assert.equal(verifyPassword("legacy", "legacy"), true);
  assert.equal(verifyPassword("legacy", "other"), false);
  assert.equal(needsPasswordMigration("legacy"), true);
});
