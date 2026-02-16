import { Store } from "./store.js";
import { AuthManager } from "./auth.js";
import { createCorsOriginResolver, parseJsonBody, sendJson, sendPreflight } from "./httpUtils.js";
import { createAuthRateLimiter } from "./security/authRateLimiter.js";

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "https://codexportal-frontend.onrender.com";
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 8 * 60 * 60 * 1000);
const AUTH_RATE_LIMIT_WINDOW_MS = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 5 * 60 * 1000);
const AUTH_RATE_LIMIT_MAX_ATTEMPTS = Number(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS || 10);

/**
 * Router for contract draft persistence with role-based access.
 */
export function createRouter(dependencies = {}) {
  const store = dependencies.store || new Store();
  const auth = dependencies.auth || new AuthManager(store, { sessionTtlMs: SESSION_TTL_MS });
  const authRateLimiter = dependencies.authRateLimiter || createAuthRateLimiter({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    maxAttempts: AUTH_RATE_LIMIT_MAX_ATTEMPTS
  });
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

      if (req.method === "GET" && req.url === "/ready") {
        const ready = await checkStoreReadiness(store);
        if (!ready) {
          sendJson(req, res, 503, { status: "error", error: "Persistence unavailable" }, corsOptions);
          return;
        }

        sendJson(req, res, 200, { status: "ok" }, corsOptions);
        return;
      }

      if (req.method === "POST" && req.url === "/auth/login") {
        const payload = await parseJsonBody(req);
        const loginLimiterKey = buildAuthRateLimitKey(req, payload.username);
        authRateLimiter.ensureAllowed(loginLimiterKey);
        const session = await auth.login(payload.username, payload.password);
        authRateLimiter.clear(loginLimiterKey);
        sendJson(req, res, 200, session, corsOptions);
        return;
      }

      if (req.method === "POST" && req.url === "/auth/signup") {
        const payload = await parseJsonBody(req);
        const signupLimiterKey = buildAuthRateLimitKey(req, payload.username);
        authRateLimiter.ensureAllowed(signupLimiterKey);
        const created = await store.createUser({
          username: String(payload.username || "").trim(),
          password: String(payload.password || ""),
          role: "customer"
        });
        authRateLimiter.clear(signupLimiterKey);
        sendJson(req, res, 201, { user: sanitizeUser(created) }, corsOptions);
        return;
      }

      if (req.method === "GET" && req.url === "/auth/me") {
        const user = await auth.authenticate(req.headers.authorization);
        sendJson(req, res, 200, user, corsOptions);
        return;
      }

      if (req.method === "POST" && req.url === "/auth/logout") {
        auth.logout(req.headers.authorization);
        sendJson(req, res, 200, { loggedOut: true }, corsOptions);
        return;
      }

      if (req.method === "POST" && req.url === "/drafts") {
        const user = await auth.authenticate(req.headers.authorization);
        const payload = await parseJsonBody(req);

        const saved = await store.saveDraft({
          id: payload.id,
          ownerUserId: user.id,
          schemaVersion: payload.schemaVersion,
          status: payload.status,
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

      if (req.method === "GET" && req.url === "/admin/users") {
        const actor = await requireAdmin(auth, req);
        const users = await store.listUsers();
        sendJson(req, res, 200, {
          actor,
          users: users.map((user) => sanitizeUser(user))
        }, corsOptions);
        return;
      }

      if (req.method === "POST" && req.url === "/admin/users") {
        await requireAdmin(auth, req);
        const payload = await parseJsonBody(req);
        const created = await store.createUser({
          username: String(payload.username || "").trim(),
          password: String(payload.password || ""),
          role: payload.role || "customer"
        });
        sendJson(req, res, 201, { user: sanitizeUser(created) }, corsOptions);
        return;
      }

      if (req.method === "POST" && req.url.startsWith("/admin/users/") && req.url.endsWith("/reset-password")) {
        const actor = await requireAdmin(auth, req);
        const userId = req.url.replace("/admin/users/", "").replace("/reset-password", "");
        const payload = await parseJsonBody(req);

        if (actor.id === userId) {
          throw new Error("Admin cannot reset own password here");
        }

        const updated = await store.updateUserPassword(userId, String(payload.password || ""));
        if (!updated) {
          sendJson(req, res, 404, { error: "User not found" }, corsOptions);
          return;
        }

        sendJson(req, res, 200, { user: sanitizeUser(updated) }, corsOptions);
        return;
      }

      if (req.method === "DELETE" && req.url.startsWith("/admin/users/")) {
        const actor = await requireAdmin(auth, req);
        const userId = req.url.replace("/admin/users/", "");

        if (actor.id === userId) {
          throw new Error("Admin cannot delete own account");
        }

        const deleted = await store.deleteUserById(userId);
        if (!deleted) {
          sendJson(req, res, 404, { error: "User not found" }, corsOptions);
          return;
        }

        sendJson(req, res, 200, { deleted: true, id: userId }, corsOptions);
        return;
      }

      sendJson(req, res, 404, { error: "Not found" }, corsOptions);
    } catch (error) {
      const statusCode = mapErrorToStatusCode(error);
      sendJson(req, res, statusCode, { error: error.message }, corsOptions);
    }
  };
}

function canAccessDraft(user, draft) {
  return user.role === "superuser" || draft.ownerUserId === user.id;
}

async function checkStoreReadiness(store) {
  if (typeof store.isReady !== "function") {
    return true;
  }

  try {
    return await store.isReady();
  } catch {
    return false;
  }
}

async function requireAdmin(auth, req) {
  const user = await auth.authenticate(req.headers.authorization);
  if (user.role !== "superuser") {
    throw new Error("Forbidden");
  }
  return user;
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role
  };
}

function mapErrorToStatusCode(error) {
  const message = String(error?.message || "");

  if (["Missing bearer token", "Invalid token", "Session expired"].includes(message)) {
    return 401;
  }

  if (message === "Forbidden") {
    return 403;
  }

  if (message === "Admin cannot delete own account" || message === "Admin cannot reset own password here") {
    return 403;
  }

  if (message === "User not found" || message === "Draft not found") {
    return 404;
  }

  if (message === "Username already exists") {
    return 409;
  }

  if (message.includes("must have at least") || message === "Invalid role" || message === "Request body is required") {
    return 422;
  }

  if (message === "Too many authentication attempts. Please retry later.") {
    return 429;
  }

  if (message === "Invalid credentials") {
    return 401;
  }

  return 400;
}

function buildAuthRateLimitKey(req, username) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0]?.trim();
  const remoteAddress = String(req.socket?.remoteAddress || "").trim();
  const userPart = String(username || "").trim().toLowerCase() || "unknown-user";
  const ipPart = forwarded || remoteAddress || "unknown-ip";
  return `${ipPart}|${userPart}`;
}
