import { randomUUID } from "node:crypto";
import { needsPasswordMigration, verifyPassword } from "./security/passwords.js";

const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * Simple token-based authentication manager.
 */
export class AuthManager {
  constructor(store, options = {}) {
    this.store = store;
    this.now = options.now || Date.now;
    this.sessionTtlMs = normalizeSessionTtl(options.sessionTtlMs);
    this.sessions = new Map();
  }

  /**
   * Validates user credentials and returns a session token.
   */
  async login(username, password) {
    const user = await this.store.getUserByUsername(username);
    if (!user || !verifyPassword(password, user.password)) {
      throw new Error("Invalid credentials");
    }

    if (needsPasswordMigration(user.password) && typeof this.store.updateUserPassword === "function") {
      await this.store.updateUserPassword(user.id, password);
    }

    const token = randomUUID();
    this.sessions.set(token, {
      userId: user.id,
      expiresAt: this.now() + this.sessionTtlMs
    });
    return { token, user: sanitizeUser(user) };
  }

  /**
   * Resolves a user from bearer token.
   */
  async authenticate(authorizationHeader) {
    if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
      throw new Error("Missing bearer token");
    }

    const token = authorizationHeader.replace("Bearer ", "").trim();
    const session = this.sessions.get(token);
    if (!session) {
      throw new Error("Invalid token");
    }
    if (session.expiresAt <= this.now()) {
      this.sessions.delete(token);
      throw new Error("Session expired");
    }

    const user = await this.store.getUserById(session.userId);
    if (!user) {
      throw new Error("Unknown user");
    }

    return sanitizeUser(user);
  }

  /**
   * Invalidates an active bearer session token.
   */
  logout(authorizationHeader) {
    if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
      throw new Error("Missing bearer token");
    }
    const token = authorizationHeader.replace("Bearer ", "").trim();
    if (!this.sessions.has(token)) {
      throw new Error("Invalid token");
    }
    this.sessions.delete(token);
  }
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role
  };
}

function normalizeSessionTtl(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_SESSION_TTL_MS;
  }
  return Math.floor(value);
}
