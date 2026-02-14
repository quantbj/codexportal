import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

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
   * Creates a new draft or updates an existing draft.
   */
  saveDraft({ id, ownerUserId, schemaVersion, payload }) {
    const now = new Date().toISOString();

    if (id) {
      const existing = this.drafts.find((draft) => draft.id === id);
      if (existing) {
        existing.updatedAt = now;
        existing.schemaVersion = schemaVersion || existing.schemaVersion;
        existing.payload = payload;
        writeJson(this.draftsFile, this.drafts);
        return existing;
      }
    }

    const created = {
      id: randomUUID(),
      ownerUserId,
      schemaVersion: schemaVersion || "v1",
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
      return [...this.drafts];
    }

    return this.drafts.filter((draft) => draft.ownerUserId === user.id);
  }

  /**
   * Returns one draft by id.
   */
  getDraftById(id) {
    return this.drafts.find((draft) => draft.id === id) || null;
  }
}

function ensureDataFiles(dataDir, usersFile, draftsFile) {
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(usersFile)) {
    writeJson(usersFile, [
      { id: "u-customer-1", username: "customer1", password: "customer1", role: "customer" },
      { id: "u-customer-2", username: "customer2", password: "customer2", role: "customer" },
      { id: "u-super-1", username: "admin", password: "admin", role: "superuser" }
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
