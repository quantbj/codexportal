import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../src/store.js";

test("Store initializes default users and supports role-filtered draft access", async () => {
  const tempDir = path.resolve("/tmp", `contracts-service-${randomUUID()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  process.env.CONTRACTS_SERVICE_DATA_DIR = tempDir;
  const store = new Store();

  const customer = store.getUserByUsername("customer1");
  const superuser = store.getUserByUsername("admin");

  assert.ok(customer);
  assert.equal(customer.role, "customer");
  assert.ok(superuser);
  assert.equal(superuser.role, "superuser");
  assert.equal(store.getUserById("missing"), null);

  const created = store.saveDraft({
    ownerUserId: customer.id,
    schemaVersion: "v1",
    payload: { hello: "world" }
  });

  assert.ok(created.id);
  assert.equal(created.status, "draft");
  assert.equal(store.listDraftsForUser(customer).length, 1);
  assert.equal(store.listDraftsForUser(superuser).length, 1);

  const updated = store.saveDraft({
    id: created.id,
    ownerUserId: customer.id,
    schemaVersion: "v2",
    status: "booked",
    payload: { hello: "updated" }
  });

  assert.equal(updated.schemaVersion, "v2");
  assert.equal(updated.status, "booked");
  assert.equal(updated.payload.hello, "updated");
  assert.equal(store.getDraftById(created.id).payload.hello, "updated");
  assert.equal(store.deleteDraftById(created.id), true);
  assert.equal(store.getDraftById(created.id), null);
  assert.equal(store.deleteDraftById("missing"), false);

  const createdUser = store.createUser({
    username: "newuser",
    password: "newpass",
    role: "customer"
  });
  assert.equal(createdUser.username, "newuser");
  assert.equal(store.listUsers().some((user) => user.username === "newuser"), true);
  assert.throws(() => {
    store.createUser({ username: "newuser", password: "otherpass", role: "customer" });
  }, /Username already exists/);

  const updatedUser = store.updateUserPassword(createdUser.id, "changedpass");
  assert.notEqual(updatedUser.password, "changedpass");
  assert.equal(updatedUser.password.startsWith("scrypt$"), true);
  assert.equal(store.deleteUserById(createdUser.id), true);
  assert.equal(store.deleteUserById(createdUser.id), false);
  assert.equal(store.updateUserPassword("missing-user", "changedpass"), null);
  assert.throws(() => {
    store.updateUserPassword(customer.id, "x");
  }, /Password must have at least 4 characters/);
  assert.throws(() => {
    store.createUser({ username: "ab", password: "validpass", role: "customer" });
  }, /Username must have at least 3 characters/);
  assert.throws(() => {
    store.createUser({ username: "validname", password: "123", role: "customer" });
  }, /Password must have at least 4 characters/);
  assert.throws(() => {
    store.createUser({ username: "validname2", password: "validpass", role: "invalid-role" });
  }, /Invalid role/);
});

test("Store falls back when persisted JSON is invalid", async () => {
  const tempDir = path.resolve("/tmp", `contracts-service-${randomUUID()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  process.env.CONTRACTS_SERVICE_DATA_DIR = tempDir;

  const usersFile = path.join(tempDir, "users.json");
  const draftsFile = path.join(tempDir, "drafts.json");
  fs.writeFileSync(usersFile, "{bad}");
  fs.writeFileSync(draftsFile, "{bad}");

  const store = new Store();
  assert.deepEqual(store.users, []);
  assert.deepEqual(store.drafts, []);
});

test("Store uses existing files and default data directory branch", async () => {
  const tempDir = path.resolve("/tmp", `contracts-service-${randomUUID()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  process.env.CONTRACTS_SERVICE_DATA_DIR = tempDir;

  const usersFile = path.join(tempDir, "users.json");
  const draftsFile = path.join(tempDir, "drafts.json");
  fs.writeFileSync(usersFile, JSON.stringify([{ id: "uX", username: "x", password: "x", role: "customer" }]));
  fs.writeFileSync(draftsFile, JSON.stringify([{ id: "dX", ownerUserId: "uX", payload: {} }]));

  const fromExisting = new Store();
  assert.equal(fromExisting.getUserByUsername("x").id, "uX");
  assert.equal(fromExisting.getDraftById("dX").id, "dX");

  delete process.env.CONTRACTS_SERVICE_DATA_DIR;
  const usingDefaultDir = new Store();
  assert.ok(usingDefaultDir.getUserByUsername("customer1"));
});
