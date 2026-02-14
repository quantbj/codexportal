import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { hashPassword } from "./security/passwords.js";

/**
 * MongoDB-backed persistence for users and draft contracts.
 */
export class MongoStore {
  constructor(options = {}) {
    this.uri = options.uri || process.env.MONGODB_URI || "";
    this.dbName = options.dbName || process.env.MONGODB_DB_NAME || "sales_portal";
    this.usersCollectionName = options.usersCollectionName || process.env.MONGODB_USERS_COLLECTION || "users";
    this.draftsCollectionName = options.draftsCollectionName || process.env.MONGODB_DRAFTS_COLLECTION || "drafts";
    this.seedDemoUsers = options.seedDemoUsers ?? process.env.SEED_DEMO_USERS !== "false";
    this.client = null;
    this.db = null;
    this.users = null;
    this.drafts = null;
  }

  async initialize() {
    if (!this.uri) {
      throw new Error("Missing MONGODB_URI");
    }

    this.client = new MongoClient(this.uri, {
      retryWrites: true,
      serverSelectionTimeoutMS: 10_000
    });
    await this.client.connect();
    this.db = this.client.db(this.dbName);
    this.users = this.db.collection(this.usersCollectionName);
    this.drafts = this.db.collection(this.draftsCollectionName);

    await this.drafts.createIndex({ ownerUserId: 1, updatedAt: -1 });
    await this.users.createIndex({ username: 1 }, { unique: true });
    await this.drafts.createIndex({ id: 1 }, { unique: true });

    if (this.seedDemoUsers) {
      await this.ensureDemoUsers();
    }
  }

  async getUserByUsername(username) {
    return this.users.findOne({ username });
  }

  async getUserById(userId) {
    return this.users.findOne({ id: userId });
  }

  async listUsers() {
    return this.users.find({}).sort({ username: 1 }).toArray();
  }

  async createUser({ username, password, role = "customer" }) {
    validateUserInput({ username, password, role });
    const created = { id: randomUUID(), username, password: hashPassword(password), role };

    try {
      await this.users.insertOne(created);
    } catch (error) {
      if (error?.code === 11000) {
        throw new Error("Username already exists");
      }
      throw error;
    }

    return created;
  }

  async deleteUserById(id) {
    const result = await this.users.deleteOne({ id });
    if (result.deletedCount > 0) {
      await this.drafts.deleteMany({ ownerUserId: id });
      return true;
    }
    return false;
  }

  async updateUserPassword(id, password) {
    if (!password || password.trim().length < 4) {
      throw new Error("Password must have at least 4 characters");
    }

    const result = await this.users.findOneAndUpdate(
      { id },
      { $set: { password: hashPassword(password) } },
      { returnDocument: "after" }
    );
    return result || null;
  }

  async saveDraft({ id, ownerUserId, schemaVersion, payload }) {
    const now = new Date().toISOString();
    const draftId = id || randomUUID();
    const nextSchemaVersion = schemaVersion || "v1";

    await this.drafts.updateOne(
      { id: draftId },
      {
        $set: {
          ownerUserId,
          schemaVersion: nextSchemaVersion,
          payload,
          updatedAt: now
        },
        $setOnInsert: {
          id: draftId,
          createdAt: now
        }
      },
      { upsert: true }
    );

    return this.getDraftById(draftId);
  }

  async listDraftsForUser(user) {
    const query = user.role === "superuser" ? {} : { ownerUserId: user.id };
    return this.drafts.find(query).sort({ updatedAt: -1 }).toArray();
  }

  async getDraftById(id) {
    return this.drafts.findOne({ id });
  }

  async deleteDraftById(id) {
    const result = await this.drafts.deleteOne({ id });
    return result.deletedCount > 0;
  }

  /**
   * Active readiness probe against MongoDB connection.
   */
  async isReady() {
    await this.db.command({ ping: 1 });
    return true;
  }

  async ensureDemoUsers() {
    const count = await this.users.countDocuments();
    if (count > 0) {
      return;
    }

    await this.users.insertMany([
      { id: "u-customer-1", username: "customer1", password: hashPassword("customer1"), role: "customer" },
      { id: "u-customer-2", username: "customer2", password: hashPassword("customer2"), role: "customer" },
      { id: "u-super-1", username: "admin", password: hashPassword("admin"), role: "superuser" }
    ]);
  }
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
