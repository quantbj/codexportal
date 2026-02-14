import { Store } from "./store.js";
import { AuthManager } from "./auth.js";
import { createCorsOriginResolver, parseJsonBody, sendJson, sendPreflight } from "./httpUtils.js";

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "https://codexportal-frontend.onrender.com";

/**
 * Router for contract draft persistence with role-based access.
 */
export function createRouter(dependencies = {}) {
  const store = dependencies.store || new Store();
  const auth = dependencies.auth || new AuthManager(store);
  const corsOptions = {
    allowMethods: "GET,POST,DELETE,OPTIONS",
    allowHeaders: "Content-Type,Authorization",
    resolveCorsOrigin: createCorsOriginResolver({ defaultOrigin: FRONTEND_ORIGIN })
  };

  return async function route(req, res) {
    try {
      if (req.method === "OPTIONS") {
        sendPreflight(req, res, corsOptions);
        return;
      }

      if (req.method === "GET" && req.url === "/health") {
        sendJson(req, res, 200, { status: "ok" }, corsOptions);
        return;
      }

      if (req.method === "POST" && req.url === "/auth/login") {
        const payload = await parseJsonBody(req);
        const session = await auth.login(payload.username, payload.password);
        sendJson(req, res, 200, session, corsOptions);
        return;
      }

      if (req.method === "GET" && req.url === "/auth/me") {
        const user = await auth.authenticate(req.headers.authorization);
        sendJson(req, res, 200, user, corsOptions);
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

        sendJson(req, res, 201, saved, corsOptions);
        return;
      }

      if (req.method === "GET" && req.url === "/drafts") {
        const user = await auth.authenticate(req.headers.authorization);
        const drafts = await store.listDraftsForUser(user);
        sendJson(req, res, 200, drafts, corsOptions);
        return;
      }

      if (req.method === "GET" && req.url.startsWith("/drafts/")) {
        const user = await auth.authenticate(req.headers.authorization);
        const draftId = req.url.replace("/drafts/", "");
        const draft = await store.getDraftById(draftId);

        if (!draft) {
          sendJson(req, res, 404, { error: "Draft not found" }, corsOptions);
          return;
        }

        if (!canAccessDraft(user, draft)) {
          sendJson(req, res, 403, { error: "Forbidden" }, corsOptions);
          return;
        }

        sendJson(req, res, 200, draft, corsOptions);
        return;
      }

      if (req.method === "DELETE" && req.url.startsWith("/drafts/")) {
        const user = await auth.authenticate(req.headers.authorization);
        const draftId = req.url.replace("/drafts/", "");
        const draft = await store.getDraftById(draftId);

        if (!draft) {
          sendJson(req, res, 404, { error: "Draft not found" }, corsOptions);
          return;
        }

        if (!canAccessDraft(user, draft)) {
          sendJson(req, res, 403, { error: "Forbidden" }, corsOptions);
          return;
        }

        await store.deleteDraftById(draftId);
        sendJson(req, res, 200, { deleted: true, id: draftId }, corsOptions);
        return;
      }

      sendJson(req, res, 404, { error: "Not found" }, corsOptions);
    } catch (error) {
      sendJson(req, res, 400, { error: error.message }, corsOptions);
    }
  };
}

function canAccessDraft(user, draft) {
  return user.role === "superuser" || draft.ownerUserId === user.id;
}
