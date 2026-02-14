import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";

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
      { id: "u-customer-1", username: "customer1", password: "customer1", role: "customer" },
      { id: "u-customer-2", username: "customer2", password: "customer2", role: "customer" },
      { id: "u-super-1", username: "admin", password: "admin", role: "superuser" }
    ]);
  }
}
