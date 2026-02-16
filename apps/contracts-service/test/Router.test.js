import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import { createRouter } from "../src/router.js";
import { createAuthRateLimiter } from "../src/security/authRateLimiter.js";

const EXPECTED_CORS_ORIGIN = "https://codexportal-frontend.onrender.com";

function createMemoryStore({ ready = true, throwOnReady = false } = {}) {
  const users = [
    { id: "u1", username: "customer1", password: "customer1", role: "customer" },
    { id: "u2", username: "customer2", password: "customer2", role: "customer" },
    { id: "su", username: "admin", password: "admin", role: "superuser" }
  ];
  const usersByUsername = new Map(users.map((user) => [user.username, user]));
  const usersById = new Map(users.map((user) => [user.id, user]));
  const drafts = [];

  return {
    getUserByUsername(username) {
      return usersByUsername.get(username) || null;
    },
    getUserById(id) {
      return usersById.get(id) || null;
    },
    listUsers() {
      return [...users];
    },
    createUser({ username, password, role = "customer" }) {
      if (!username || username.length < 3) {
        throw new Error("Username must have at least 3 characters");
      }
      if (!password || password.length < 4) {
        throw new Error("Password must have at least 4 characters");
      }
      if (usersByUsername.has(username)) {
        throw new Error("Username already exists");
      }
      const created = {
        id: `u-${users.length + 1}`,
        username,
        password,
        role
      };
      users.push(created);
      usersByUsername.set(created.username, created);
      usersById.set(created.id, created);
      return created;
    },
    deleteUserById(id) {
      const index = users.findIndex((user) => user.id === id);
      if (index === -1) {
        return false;
      }
      const [deleted] = users.splice(index, 1);
      usersByUsername.delete(deleted.username);
      usersById.delete(deleted.id);
      return true;
    },
    updateUserPassword(id, password) {
      if (!password || password.length < 4) {
        throw new Error("Password must have at least 4 characters");
      }
      const user = usersById.get(id) || null;
      if (!user) {
        return null;
      }
      user.password = password;
      return user;
    },
    saveDraft({ id, ownerUserId, schemaVersion, status, payload }) {
      const nextStatus = status === "booked" ? "booked" : "draft";
      if (id) {
        const existing = drafts.find((draft) => draft.id === id);
        if (existing) {
          existing.payload = payload;
          existing.status = nextStatus;
          return existing;
        }
      }

      const created = {
        id: `d-${drafts.length + 1}`,
        ownerUserId,
        schemaVersion: schemaVersion || "v1",
        status: nextStatus,
        payload
      };
      drafts.push(created);
      return created;
    },
    listDraftsForUser(user) {
      return user.role === "superuser" ? [...drafts] : drafts.filter((draft) => draft.ownerUserId === user.id);
    },
    getDraftById(id) {
      return drafts.find((draft) => draft.id === id) || null;
    },
    deleteDraftById(id) {
      const index = drafts.findIndex((draft) => draft.id === id);
      if (index === -1) {
        return false;
      }
      drafts.splice(index, 1);
      return true;
    },
    async isReady() {
      if (throwOnReady) {
        throw new Error("db down");
      }
      return ready;
    }
  };
}

async function invokeRoute(router, { method, url, payload, authorization, origin }) {
  const req = Readable.from(payload === undefined ? [] : [JSON.stringify(payload)]);
  req.method = method;
  req.url = url;
  req.headers = { authorization: authorization || "", origin: origin || "" };

  let statusCode = 200;
  let body = "";
  const headers = {};

  const res = {
    writeHead(code, nextHeaders) {
      statusCode = code;
      Object.assign(headers, nextHeaders);
    },
    end(value) {
      body = value || "";
    }
  };

  await router(req, res);

  return {
    statusCode,
    headers,
    body: body ? JSON.parse(body) : {}
  };
}

test("contracts-service authenticates, stores drafts and enforces role access", async () => {
  const router = createRouter({ store: createMemoryStore() });

  const loginCustomer = await invokeRoute(router, {
    method: "POST",
    url: "/auth/login",
    payload: { username: "customer1", password: "customer1" }
  });
  assert.equal(loginCustomer.statusCode, 200);
  const customerToken = loginCustomer.body.token;

  const saveDraft = await invokeRoute(router, {
    method: "POST",
    url: "/drafts",
    authorization: `Bearer ${customerToken}`,
    payload: { payload: { contractParameters: { pricing: { foo: 1 } } } }
  });
  assert.equal(saveDraft.statusCode, 201);
  assert.equal(saveDraft.body.status, "draft");
  const draftId = saveDraft.body.id;

  const loginOther = await invokeRoute(router, {
    method: "POST",
    url: "/auth/login",
    payload: { username: "customer2", password: "customer2" }
  });
  const otherToken = loginOther.body.token;

  const forbidden = await invokeRoute(router, {
    method: "GET",
    url: `/drafts/${draftId}`,
    authorization: `Bearer ${otherToken}`
  });
  assert.equal(forbidden.statusCode, 403);

  const loginAdmin = await invokeRoute(router, {
    method: "POST",
    url: "/auth/login",
    payload: { username: "admin", password: "admin" }
  });
  const adminToken = loginAdmin.body.token;

  const listForAdmin = await invokeRoute(router, {
    method: "GET",
    url: "/drafts",
    authorization: `Bearer ${adminToken}`
  });
  assert.equal(listForAdmin.statusCode, 200);
  assert.equal(listForAdmin.body.length, 1);
});

test("contracts-service validates auth and JSON", async () => {
  const router = createRouter({ store: createMemoryStore() });

  const noAuth = await invokeRoute(router, { method: "GET", url: "/drafts" });
  assert.equal(noAuth.statusCode, 401);

  const badLogin = await invokeRoute(router, {
    method: "POST",
    url: "/auth/login",
    payload: { username: "customer1", password: "wrong" }
  });
  assert.equal(badLogin.statusCode, 401);

  const health = await invokeRoute(router, { method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);
  assert.equal(health.headers["Access-Control-Allow-Origin"], EXPECTED_CORS_ORIGIN);

  const ready = await invokeRoute(router, { method: "GET", url: "/ready" });
  assert.equal(ready.statusCode, 200);
  assert.equal(ready.body.status, "ok");

  const signup = await invokeRoute(router, {
    method: "POST",
    url: "/auth/signup",
    payload: { username: "newcustomer", password: "newcustomer" }
  });
  assert.equal(signup.statusCode, 201);
  assert.equal(signup.body.user.role, "customer");
});

test("contracts-service returns 503 when readiness check fails", async () => {
  const downRouter = createRouter({ store: createMemoryStore({ ready: false }) });
  const downResponse = await invokeRoute(downRouter, { method: "GET", url: "/ready" });
  assert.equal(downResponse.statusCode, 503);
  assert.equal(downResponse.body.error, "Persistence unavailable");

  const throwingRouter = createRouter({ store: createMemoryStore({ throwOnReady: true }) });
  const throwingResponse = await invokeRoute(throwingRouter, { method: "GET", url: "/ready" });
  assert.equal(throwingResponse.statusCode, 503);

  const noReadinessStore = createMemoryStore();
  delete noReadinessStore.isReady;
  const noReadinessRouter = createRouter({ store: noReadinessStore });
  const noReadinessResponse = await invokeRoute(noReadinessRouter, { method: "GET", url: "/ready" });
  assert.equal(noReadinessResponse.statusCode, 200);
});

test("contracts-service supports me endpoint, draft update, and not-found handling", async () => {
  const router = createRouter({ store: createMemoryStore() });

  const login = await invokeRoute(router, {
    method: "POST",
    url: "/auth/login",
    payload: { username: "customer1", password: "customer1" }
  });
  const token = login.body.token;

  const me = await invokeRoute(router, {
    method: "GET",
    url: "/auth/me",
    authorization: `Bearer ${token}`
  });
  assert.equal(me.statusCode, 200);
  assert.equal(me.body.username, "customer1");

  const created = await invokeRoute(router, {
    method: "POST",
    url: "/drafts",
    authorization: `Bearer ${token}`,
    payload: { payload: { v: 1 } }
  });
  assert.equal(created.statusCode, 201);

  const updated = await invokeRoute(router, {
    method: "POST",
    url: "/drafts",
    authorization: `Bearer ${token}`,
    payload: { id: created.body.id, payload: { v: 2 } }
  });
  assert.equal(updated.statusCode, 201);
  assert.equal(updated.body.payload.v, 2);
  assert.equal(updated.body.status, "draft");

  const booked = await invokeRoute(router, {
    method: "POST",
    url: "/drafts",
    authorization: `Bearer ${token}`,
    payload: { id: created.body.id, status: "booked", payload: { v: 3 } }
  });
  assert.equal(booked.statusCode, 201);
  assert.equal(booked.body.status, "booked");

  const getOwnDraft = await invokeRoute(router, {
    method: "GET",
    url: `/drafts/${created.body.id}`,
    authorization: `Bearer ${token}`
  });
  assert.equal(getOwnDraft.statusCode, 200);

  const notFound = await invokeRoute(router, {
    method: "GET",
    url: "/drafts/not-existing",
    authorization: `Bearer ${token}`
  });
  assert.equal(notFound.statusCode, 404);

  const deleted = await invokeRoute(router, {
    method: "DELETE",
    url: `/drafts/${created.body.id}`,
    authorization: `Bearer ${token}`
  });
  assert.equal(deleted.statusCode, 200);
  assert.equal(deleted.body.deleted, true);

  const afterDelete = await invokeRoute(router, {
    method: "GET",
    url: `/drafts/${created.body.id}`,
    authorization: `Bearer ${token}`
  });
  assert.equal(afterDelete.statusCode, 404);
});

test("contracts-service supports admin user management", async () => {
  const router = createRouter({ store: createMemoryStore() });

  const adminLogin = await invokeRoute(router, {
    method: "POST",
    url: "/auth/login",
    payload: { username: "admin", password: "admin" }
  });
  const adminToken = adminLogin.body.token;

  const createUser = await invokeRoute(router, {
    method: "POST",
    url: "/admin/users",
    authorization: `Bearer ${adminToken}`,
    payload: { username: "managed1", password: "managed1", role: "customer" }
  });
  assert.equal(createUser.statusCode, 201);

  const listUsers = await invokeRoute(router, {
    method: "GET",
    url: "/admin/users",
    authorization: `Bearer ${adminToken}`
  });
  assert.equal(listUsers.statusCode, 200);
  assert.ok(listUsers.body.users.some((user) => user.username === "managed1"));

  const reset = await invokeRoute(router, {
    method: "POST",
    url: `/admin/users/${createUser.body.user.id}/reset-password`,
    authorization: `Bearer ${adminToken}`,
    payload: { password: "changed1" }
  });
  assert.equal(reset.statusCode, 200);

  const deleteUser = await invokeRoute(router, {
    method: "DELETE",
    url: `/admin/users/${createUser.body.user.id}`,
    authorization: `Bearer ${adminToken}`
  });
  assert.equal(deleteUser.statusCode, 200);

  const missingReset = await invokeRoute(router, {
    method: "POST",
    url: "/admin/users/not-existing/reset-password",
    authorization: `Bearer ${adminToken}`,
    payload: { password: "changed1" }
  });
  assert.equal(missingReset.statusCode, 404);

  const missingDelete = await invokeRoute(router, {
    method: "DELETE",
    url: "/admin/users/not-existing",
    authorization: `Bearer ${adminToken}`
  });
  assert.equal(missingDelete.statusCode, 404);

  const resetOwn = await invokeRoute(router, {
    method: "POST",
    url: "/admin/users/su/reset-password",
    authorization: `Bearer ${adminToken}`,
    payload: { password: "changed1" }
  });
  assert.equal(resetOwn.statusCode, 403);

  const deleteOwn = await invokeRoute(router, {
    method: "DELETE",
    url: "/admin/users/su",
    authorization: `Bearer ${adminToken}`
  });
  assert.equal(deleteOwn.statusCode, 403);

  const duplicateSignup = await invokeRoute(router, {
    method: "POST",
    url: "/auth/signup",
    payload: { username: "customer1", password: "customer1" }
  });
  assert.equal(duplicateSignup.statusCode, 409);

  const customerLogin = await invokeRoute(router, {
    method: "POST",
    url: "/auth/login",
    payload: { username: "customer1", password: "customer1" }
  });
  const customerToken = customerLogin.body.token;
  const forbidden = await invokeRoute(router, {
    method: "GET",
    url: "/admin/users",
    authorization: `Bearer ${customerToken}`
  });
  assert.equal(forbidden.statusCode, 403);
});

test("contracts-service handles preflight, invalid JSON and unknown route", async () => {
  const router = createRouter({ store: createMemoryStore() });

  const options = await invokeRoute(router, { method: "OPTIONS", url: "/drafts" });
  assert.equal(options.statusCode, 204);
  assert.deepEqual(options.body, {});
  assert.equal(options.headers["Access-Control-Allow-Methods"], "GET,POST,DELETE,OPTIONS");

  const req = Readable.from(["{bad}"]);
  req.method = "POST";
  req.url = "/auth/login";
  req.headers = {};

  let statusCode = 200;
  let body = "";
  const res = {
    writeHead(code) {
      statusCode = code;
    },
    end(value) {
      body = value || "";
    }
  };

  await router(req, res);
  assert.equal(statusCode, 400);
  assert.equal(JSON.parse(body).error, "Invalid JSON payload");

  const missingBodyLogin = await invokeRoute(router, {
    method: "POST",
    url: "/auth/login"
  });
  assert.equal(missingBodyLogin.statusCode, 422);
  assert.equal(missingBodyLogin.body.error, "Request body is required");

  const oversizedReq = Readable.from(["x".repeat((1024 * 1024) + 1)]);
  oversizedReq.method = "POST";
  oversizedReq.url = "/auth/login";
  oversizedReq.headers = {};

  let oversizedStatus = 200;
  let oversizedBody = "";
  const oversizedRes = {
    writeHead(code) {
      oversizedStatus = code;
    },
    end(value) {
      oversizedBody = value || "";
    }
  };

  await router(oversizedReq, oversizedRes);
  assert.equal(oversizedStatus, 400);
  assert.equal(JSON.parse(oversizedBody).error, "Payload too large");

  const unknown = await invokeRoute(router, { method: "GET", url: "/unknown" });
  assert.equal(unknown.statusCode, 404);
});

test("contracts-service supports explicit logout and blocks logged-out sessions", async () => {
  const router = createRouter({ store: createMemoryStore() });
  const login = await invokeRoute(router, {
    method: "POST",
    url: "/auth/login",
    payload: { username: "customer1", password: "customer1" }
  });
  const token = login.body.token;

  const logout = await invokeRoute(router, {
    method: "POST",
    url: "/auth/logout",
    authorization: `Bearer ${token}`
  });
  assert.equal(logout.statusCode, 200);
  assert.equal(logout.body.loggedOut, true);

  const meAfterLogout = await invokeRoute(router, {
    method: "GET",
    url: "/auth/me",
    authorization: `Bearer ${token}`
  });
  assert.equal(meAfterLogout.statusCode, 401);
});

test("contracts-service rate limits repeated failed logins", async () => {
  const router = createRouter({
    store: createMemoryStore(),
    authRateLimiter: createAuthRateLimiter({ maxAttempts: 1, windowMs: 60_000 })
  });

  const firstFailure = await invokeRoute(router, {
    method: "POST",
    url: "/auth/login",
    payload: { username: "customer1", password: "wrong" }
  });
  assert.equal(firstFailure.statusCode, 401);

  const secondFailure = await invokeRoute(router, {
    method: "POST",
    url: "/auth/login",
    payload: { username: "customer1", password: "wrong" }
  });
  assert.equal(secondFailure.statusCode, 429);
});

test("contracts-service prevents deleting drafts from another customer", async () => {
  const router = createRouter({ store: createMemoryStore() });

  const ownerLogin = await invokeRoute(router, {
    method: "POST",
    url: "/auth/login",
    payload: { username: "customer1", password: "customer1" }
  });
  const ownerToken = ownerLogin.body.token;

  const created = await invokeRoute(router, {
    method: "POST",
    url: "/drafts",
    authorization: `Bearer ${ownerToken}`,
    payload: { payload: { v: 1 } }
  });
  assert.equal(created.statusCode, 201);

  const otherLogin = await invokeRoute(router, {
    method: "POST",
    url: "/auth/login",
    payload: { username: "customer2", password: "customer2" }
  });
  const otherToken = otherLogin.body.token;

  const forbiddenDelete = await invokeRoute(router, {
    method: "DELETE",
    url: `/drafts/${created.body.id}`,
    authorization: `Bearer ${otherToken}`
  });
  assert.equal(forbiddenDelete.statusCode, 403);
});

test("contracts-service supports multi-origin and wildcard CORS configuration", async () => {
  const previous = process.env.FRONTEND_ORIGIN;
  try {
    process.env.FRONTEND_ORIGIN = "https://portal.example,https://frontend.example";
    const router = createRouter({ store: createMemoryStore() });
    const options = await invokeRoute(router, {
      method: "OPTIONS",
      url: "/drafts",
      origin: "https://frontend.example"
    });

    assert.equal(options.statusCode, 204);
    assert.equal(options.headers["Access-Control-Allow-Origin"], "https://frontend.example");

    process.env.FRONTEND_ORIGIN = "*";
    const wildcard = await invokeRoute(router, {
      method: "GET",
      url: "/health",
      origin: "https://any-origin.example"
    });
    assert.equal(wildcard.headers["Access-Control-Allow-Origin"], "*");

    process.env.FRONTEND_ORIGIN = "https://portal.example,https://frontend.example";
    const fallback = await invokeRoute(router, {
      method: "GET",
      url: "/health",
      origin: "https://unknown-origin.example"
    });
    assert.equal(fallback.headers["Access-Control-Allow-Origin"], "https://portal.example");

    process.env.FRONTEND_ORIGIN = " , ";
    const emptyConfig = await invokeRoute(router, {
      method: "GET",
      url: "/health",
      origin: "https://dynamic-origin.example"
    });
    assert.equal(emptyConfig.headers["Access-Control-Allow-Origin"], EXPECTED_CORS_ORIGIN);
  } finally {
    process.env.FRONTEND_ORIGIN = previous;
  }
});
