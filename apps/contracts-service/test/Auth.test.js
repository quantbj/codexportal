import test from "node:test";
import assert from "node:assert/strict";

import { AuthManager } from "../src/auth.js";

test("AuthManager handles invalid token and unknown user", async () => {
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
    }
  };

  const auth = new AuthManager(store);

  await assert.rejects(() => auth.login("ok", "bad"), /Invalid credentials/);

  const session = await auth.login("ok", "pw");
  assert.ok(session.token);
  assert.equal((await auth.authenticate(`Bearer ${session.token}`)).id, "u1");

  await assert.rejects(() => auth.login("nobody", "pw"), /Invalid credentials/);
  await assert.rejects(() => auth.authenticate("Bearer invalid"), /Invalid token/);

  auth.sessions.set("dangling", "missing-user");
  await assert.rejects(() => auth.authenticate("Bearer dangling"), /Unknown user/);
});
