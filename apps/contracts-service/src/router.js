import { Store } from "./store.js";
import { AuthManager } from "./auth.js";

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "https://codexportal-frontend.onrender.com";

/**
 * Router for contract draft persistence with role-based access.
 */
export function createRouter(dependencies = {}) {
  const store = dependencies.store || new Store();
  const auth = dependencies.auth || new AuthManager(store);

  return async function route(req, res) {
    try {
      if (req.method === "OPTIONS") {
        sendPreflight(req, res);
        return;
      }

      if (req.method === "GET" && req.url === "/health") {
        sendJson(req, res, 200, { status: "ok" });
        return;
      }

      if (req.method === "POST" && req.url === "/auth/login") {
        const payload = await parseJsonBody(req);
        const session = await auth.login(payload.username, payload.password);
        sendJson(req, res, 200, session);
        return;
      }

      if (req.method === "GET" && req.url === "/auth/me") {
        const user = await auth.authenticate(req.headers.authorization);
        sendJson(req, res, 200, user);
        return;
      }

      if (req.method === "POST" && req.url === "/drafts") {
        const user = await auth.authenticate(req.headers.authorization);
        const payload = await parseJsonBody(req);

        const saved = await store.saveDraft({
          id: payload.id,
          ownerUserId: user.id,
          schemaVersion: payload.schemaVersion,
          payload: payload.payload
        });

        sendJson(req, res, 201, saved);
        return;
      }

      if (req.method === "GET" && req.url === "/drafts") {
        const user = await auth.authenticate(req.headers.authorization);
        const drafts = await store.listDraftsForUser(user);
        sendJson(req, res, 200, drafts);
        return;
      }

      if (req.method === "GET" && req.url.startsWith("/drafts/")) {
        const user = await auth.authenticate(req.headers.authorization);
        const draftId = req.url.replace("/drafts/", "");
        const draft = await store.getDraftById(draftId);

        if (!draft) {
          sendJson(req, res, 404, { error: "Draft not found" });
          return;
        }

        if (user.role !== "superuser" && draft.ownerUserId !== user.id) {
          sendJson(req, res, 403, { error: "Forbidden" });
          return;
        }

        sendJson(req, res, 200, draft);
        return;
      }

      if (req.method === "DELETE" && req.url.startsWith("/drafts/")) {
        const user = await auth.authenticate(req.headers.authorization);
        const draftId = req.url.replace("/drafts/", "");
        const draft = await store.getDraftById(draftId);

        if (!draft) {
          sendJson(req, res, 404, { error: "Draft not found" });
          return;
        }

        if (user.role !== "superuser" && draft.ownerUserId !== user.id) {
          sendJson(req, res, 403, { error: "Forbidden" });
          return;
        }

        await store.deleteDraftById(draftId);
        sendJson(req, res, 200, { deleted: true, id: draftId });
        return;
      }

      sendJson(req, res, 404, { error: "Not found" });
    } catch (error) {
      sendJson(req, res, 400, { error: error.message });
    }
  };
}

function sendJson(req, res, statusCode, payload) {
  const body = JSON.stringify(payload);
  const corsOrigin = resolveCorsOrigin(req);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
  });
  res.end(body);
}

function sendPreflight(req, res) {
  const corsOrigin = resolveCorsOrigin(req);
  res.writeHead(204, {
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
  });
  // 204 responses must not include a body.
  res.end();
}

function resolveCorsOrigin(req) {
  const incomingOrigin = req.headers?.origin;
  const configuredOrigins = (process.env.FRONTEND_ORIGIN || FRONTEND_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!incomingOrigin) {
    return configuredOrigins[0] || "*";
  }

  if (configuredOrigins.length === 0) {
    return incomingOrigin;
  }

  if (configuredOrigins.includes("*")) {
    return "*";
  }

  if (configuredOrigins.includes(incomingOrigin)) {
    return incomingOrigin;
  }

  return configuredOrigins[0];
}

async function parseJsonBody(req) {
  let body = "";

  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1024 * 1024) {
      throw new Error("Payload too large");
    }
  }

  if (!body) {
    throw new Error("Request body is required");
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Invalid JSON payload");
  }
}
