import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const HASH_PREFIX = "scrypt";
const KEY_LENGTH = 64;

/**
 * Hashes plaintext passwords using scrypt with per-user random salt.
 */
export function hashPassword(plaintext) {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(plaintext, salt, KEY_LENGTH).toString("hex");
  return `${HASH_PREFIX}$${salt}$${digest}`;
}

/**
 * Verifies plaintext passwords against current hash format and legacy plain text.
 */
export function verifyPassword(plaintext, storedValue) {
  if (!storedValue) {
    return false;
  }

  if (isHashedPassword(storedValue)) {
    const [, salt, expectedDigest] = storedValue.split("$");
    const actualDigest = scryptSync(plaintext, salt, KEY_LENGTH).toString("hex");
    return timingSafeEqual(Buffer.from(actualDigest, "hex"), Buffer.from(expectedDigest, "hex"));
  }

  // Backward compatibility for legacy demo users that were plain text.
  return plaintext === storedValue;
}

/**
 * Detects old plain-text password entries to migrate them after successful login.
 */
export function needsPasswordMigration(storedValue) {
  return Boolean(storedValue) && !isHashedPassword(storedValue);
}

function isHashedPassword(value) {
  const parts = String(value).split("$");
  return parts.length === 3 && parts[0] === HASH_PREFIX;
}
