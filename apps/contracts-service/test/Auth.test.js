import test from "node:test";
import assert from "node:assert/strict";

import { AuthManager } from "../src/auth.js";

test("AuthManager handles invalid token and unknown user", async () => {
  let migratedPassword = "";
  const store = {
    getUserByUsername(username) {
      if (username === "ok") {
        return { id: "u1", username: "ok", password: "pw", role: "customer" };
      }
      return null;
    },
    getUserById(userId) {
      if (userId === "u1") {
        return { id: "u1", username: "ok", role: "customer" };
      }
      return null;
    },
    async updateUserPassword(userId, password) {
      if (userId === "u1") {
        migratedPassword = password;
      }
    }
  };

  const auth = new AuthManager(store);

  await assert.rejects(() => auth.login("ok", "bad"), /Invalid credentials/);

  const session = await auth.login("ok", "pw");
  assert.ok(session.token);
  assert.equal((await auth.authenticate(`Bearer ${session.token}`)).id, "u1");
  assert.equal(migratedPassword, "pw");

  await assert.rejects(() => auth.login("nobody", "pw"), /Invalid credentials/);
  await assert.rejects(() => auth.authenticate("Bearer invalid"), /Invalid token/);

  auth.sessions.set("dangling", {
    userId: "missing-user",
    expiresAt: Date.now() + 60_000
  });
  await assert.rejects(() => auth.authenticate("Bearer dangling"), /Unknown user/);
});

test("AuthManager expires and revokes sessions", async () => {
  let now = 1_000;
  const store = {
    getUserByUsername() {
      return { id: "u1", username: "ok", password: "pw", role: "customer" };
    },
    getUserById() {
      return { id: "u1", username: "ok", role: "customer" };
    }
  };
  const auth = new AuthManager(store, {
    now: () => now,
    sessionTtlMs: 50
  });

  const session = await auth.login("ok", "pw");
  await assert.doesNotReject(() => auth.authenticate(`Bearer ${session.token}`));

  now = 1_051;
  await assert.rejects(() => auth.authenticate(`Bearer ${session.token}`), /Session expired/);
  await assert.rejects(() => auth.authenticate(`Bearer ${session.token}`), /Invalid token/);

  const nextSession = await auth.login("ok", "pw");
  assert.doesNotThrow(() => auth.logout(`Bearer ${nextSession.token}`));
  await assert.rejects(() => auth.authenticate(`Bearer ${nextSession.token}`), /Invalid token/);
});
