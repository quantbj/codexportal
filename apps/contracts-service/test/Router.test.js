import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import { createRouter } from "../src/router.js";

const EXPECTED_CORS_ORIGIN = "https://codexportal-frontend.onrender.com";

function createMemoryStore() {
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
    saveDraft({ id, ownerUserId, schemaVersion, payload }) {
      if (id) {
        const existing = drafts.find((draft) => draft.id === id);
        if (existing) {
          existing.payload = payload;
          return existing;
        }
      }

      const created = {
        id: `d-${drafts.length + 1}`,
        ownerUserId,
        schemaVersion: schemaVersion || "v1",
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
  assert.equal(noAuth.statusCode, 400);

  const badLogin = await invokeRoute(router, {
    method: "POST",
    url: "/auth/login",
    payload: { username: "customer1", password: "wrong" }
  });
  assert.equal(badLogin.statusCode, 400);

  const health = await invokeRoute(router, { method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);
  assert.equal(health.headers["Access-Control-Allow-Origin"], EXPECTED_CORS_ORIGIN);
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
  assert.equal(missingBodyLogin.statusCode, 400);
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
    assert.equal(emptyConfig.headers["Access-Control-Allow-Origin"], "https://dynamic-origin.example");
  } finally {
    process.env.FRONTEND_ORIGIN = previous;
  }
});
