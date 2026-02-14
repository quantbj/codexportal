import test from "node:test";
import assert from "node:assert/strict";

import { AuthManager } from "../src/auth.js";

test("AuthManager handles invalid token and unknown user", () => {
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

  assert.throws(() => auth.login("ok", "bad"), /Invalid credentials/);

  const session = auth.login("ok", "pw");
  assert.ok(session.token);
  assert.equal(auth.authenticate(`Bearer ${session.token}`).id, "u1");

  assert.throws(() => auth.login("nobody", "pw"), /Invalid credentials/);
  assert.throws(() => auth.authenticate("Bearer invalid"), /Invalid token/);

  auth.sessions.set("dangling", "missing-user");
  assert.throws(() => auth.authenticate("Bearer dangling"), /Unknown user/);
});
