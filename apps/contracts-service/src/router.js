import { Store } from "./store.js";
import { AuthManager } from "./auth.js";

/**
 * Router for contract draft persistence with role-based access.
 */
export function createRouter(dependencies = {}) {
  const store = dependencies.store || new Store();
  const auth = dependencies.auth || new AuthManager(store);

  return async function route(req, res) {
    try {
      if (req.method === "OPTIONS") {
        sendJson(res, 204, {});
        return;
      }

      if (req.method === "GET" && req.url === "/health") {
        sendJson(res, 200, { status: "ok" });
        return;
      }

      if (req.method === "POST" && req.url === "/auth/login") {
        const payload = await parseJsonBody(req);
        const session = auth.login(payload.username, payload.password);
        sendJson(res, 200, session);
        return;
      }

      if (req.method === "GET" && req.url === "/auth/me") {
        const user = auth.authenticate(req.headers.authorization);
        sendJson(res, 200, user);
        return;
      }

      if (req.method === "POST" && req.url === "/drafts") {
        const user = auth.authenticate(req.headers.authorization);
        const payload = await parseJsonBody(req);

        const saved = store.saveDraft({
          id: payload.id,
          ownerUserId: user.id,
          schemaVersion: payload.schemaVersion,
          payload: payload.payload
        });

        sendJson(res, 201, saved);
        return;
      }

      if (req.method === "GET" && req.url === "/drafts") {
        const user = auth.authenticate(req.headers.authorization);
        const drafts = store.listDraftsForUser(user);
        sendJson(res, 200, drafts);
        return;
      }

      if (req.method === "GET" && req.url.startsWith("/drafts/")) {
        const user = auth.authenticate(req.headers.authorization);
        const draftId = req.url.replace("/drafts/", "");
        const draft = store.getDraftById(draftId);

        if (!draft) {
          sendJson(res, 404, { error: "Draft not found" });
          return;
        }

        if (user.role !== "superuser" && draft.ownerUserId !== user.id) {
          sendJson(res, 403, { error: "Forbidden" });
          return;
        }

        sendJson(res, 200, draft);
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
  };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "http://localhost:3000",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization"
  });
  res.end(body);
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
