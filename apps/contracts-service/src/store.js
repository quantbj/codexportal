import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { hashPassword } from "./security/passwords.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * File-based persistence with flexible JSON payload support.
 */
export class Store {
  constructor() {
    this.dataDir = process.env.CONTRACTS_SERVICE_DATA_DIR
      ? path.resolve(process.env.CONTRACTS_SERVICE_DATA_DIR)
      : path.resolve(__dirname, "../data");
    this.usersFile = path.join(this.dataDir, "users.json");
    this.draftsFile = path.join(this.dataDir, "drafts.json");

    ensureDataFiles(this.dataDir, this.usersFile, this.draftsFile);
    this.users = readJson(this.usersFile, []);
    this.drafts = readJson(this.draftsFile, []);
  }

  /**
   * Finds a user by username.
   */
  getUserByUsername(username) {
    return this.users.find((user) => user.username === username) || null;
  }

  /**
   * Returns a user by internal id.
   */
  getUserById(userId) {
    return this.users.find((user) => user.id === userId) || null;
  }

  /**
   * Returns all users for administrative management.
   */
  listUsers() {
    return [...this.users];
  }

  /**
   * Creates a new user account.
   */
  createUser({ username, password, role = "customer" }) {
    validateUserInput({ username, password, role });

    if (this.getUserByUsername(username)) {
      throw new Error("Username already exists");
    }

    const created = { id: randomUUID(), username, password: hashPassword(password), role };
    this.users.push(created);
    writeJson(this.usersFile, this.users);
    return created;
  }

  /**
   * Deletes one user by id.
   */
  deleteUserById(id) {
    const index = this.users.findIndex((user) => user.id === id);
    if (index === -1) {
      return false;
    }

    this.users.splice(index, 1);
    this.drafts = this.drafts.filter((draft) => draft.ownerUserId !== id);
    writeJson(this.usersFile, this.users);
    writeJson(this.draftsFile, this.drafts);
    return true;
  }

  /**
   * Resets the password for one user.
   */
  updateUserPassword(id, password) {
    if (!password || password.trim().length < 4) {
      throw new Error("Password must have at least 4 characters");
    }

    const user = this.getUserById(id);
    if (!user) {
      return null;
    }

    user.password = hashPassword(password);
    writeJson(this.usersFile, this.users);
    return user;
  }

  /**
   * Creates a new draft or updates an existing draft.
   */
  saveDraft({ id, ownerUserId, schemaVersion, status, payload }) {
    const now = new Date().toISOString();
    const nextStatus = normalizeDraftStatus(status);

    if (id) {
      const existing = this.drafts.find((draft) => draft.id === id);
      if (existing) {
        existing.updatedAt = now;
        existing.schemaVersion = schemaVersion || existing.schemaVersion;
        existing.status = nextStatus || normalizeDraftStatus(existing.status);
        existing.payload = payload;
        writeJson(this.draftsFile, this.drafts);
        return existing;
      }
    }

    const created = {
      id: randomUUID(),
      ownerUserId,
      schemaVersion: schemaVersion || "v1",
      status: nextStatus,
      payload,
      createdAt: now,
      updatedAt: now
    };

    this.drafts.push(created);
    writeJson(this.draftsFile, this.drafts);
    return created;
  }

  /**
   * Lists drafts with role-aware filtering.
   */
  listDraftsForUser(user) {
    if (user.role === "superuser") {
      return this.drafts.map((draft) => withNormalizedStatus(draft));
    }

    return this.drafts
      .filter((draft) => draft.ownerUserId === user.id)
      .map((draft) => withNormalizedStatus(draft));
  }

  /**
   * Returns one draft by id.
   */
  getDraftById(id) {
    const draft = this.drafts.find((entry) => entry.id === id);
    return draft ? withNormalizedStatus(draft) : null;
  }

  /**
   * Deletes one draft by id.
   */
  deleteDraftById(id) {
    const index = this.drafts.findIndex((draft) => draft.id === id);
    if (index === -1) {
      return false;
    }

    this.drafts.splice(index, 1);
    writeJson(this.draftsFile, this.drafts);
    return true;
  }

  /**
   * File-based fallback is always locally reachable when process is running.
   */
  async isReady() {
    return true;
  }
}

function ensureDataFiles(dataDir, usersFile, draftsFile) {
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(usersFile)) {
    writeJson(usersFile, [
      { id: "u-customer-1", username: "customer1", password: hashPassword("customer1"), role: "customer" },
      { id: "u-customer-2", username: "customer2", password: hashPassword("customer2"), role: "customer" },
      { id: "u-super-1", username: "admin", password: hashPassword("admin"), role: "superuser" }
    ]);
  }

  if (!fs.existsSync(draftsFile)) {
    writeJson(draftsFile, []);
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function validateUserInput({ username, password, role }) {
  if (!username || username.trim().length < 3) {
    throw new Error("Username must have at least 3 characters");
  }

  if (!password || password.trim().length < 4) {
    throw new Error("Password must have at least 4 characters");
  }

  if (!["customer", "superuser"].includes(role)) {
    throw new Error("Invalid role");
  }
}

function normalizeDraftStatus(status) {
  return status === "booked" ? "booked" : "draft";
}

function withNormalizedStatus(draft) {
  return {
    ...draft,
    status: normalizeDraftStatus(draft?.status)
  };
}
