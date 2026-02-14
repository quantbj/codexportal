import { randomUUID } from "node:crypto";

/**
 * Simple token-based authentication manager.
 */
export class AuthManager {
  constructor(store) {
    this.store = store;
    this.sessions = new Map();
  }

  /**
   * Validates user credentials and returns a session token.
   */
  login(username, password) {
    const user = this.store.getUserByUsername(username);
    if (!user || user.password !== password) {
      throw new Error("Invalid credentials");
    }

    const token = randomUUID();
    this.sessions.set(token, user.id);
    return { token, user: sanitizeUser(user) };
  }

  /**
   * Resolves a user from bearer token.
   */
  authenticate(authorizationHeader) {
    if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
      throw new Error("Missing bearer token");
    }

    const token = authorizationHeader.replace("Bearer ", "").trim();
    const userId = this.sessions.get(token);
    if (!userId) {
      throw new Error("Invalid token");
    }

    const user = this.store.getUserById(userId);
    if (!user) {
      throw new Error("Unknown user");
    }

    return sanitizeUser(user);
  }
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role
  };
}
