const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Creates a deterministic CORS origin resolver from environment configuration.
 */
export function createCorsOriginResolver({
  defaultOrigin,
  envName = "FRONTEND_ORIGIN"
}) {
  return function resolveCorsOrigin(req) {
    const incomingOrigin = req.headers?.origin;
    const configuredOrigins = String(process.env[envName] || defaultOrigin || "")
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
  };
}

/**
 * Sends JSON payloads with security and CORS headers.
 */
export function sendJson(req, res, statusCode, payload, options) {
  const body = JSON.stringify(payload);
  const corsOrigin = options.resolveCorsOrigin(req);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": options.allowMethods,
    "Access-Control-Allow-Headers": options.allowHeaders
  });
  res.end(body);
}

/**
 * Sends an empty preflight response for browser CORS checks.
 */
export function sendPreflight(req, res, options) {
  const corsOrigin = options.resolveCorsOrigin(req);
  res.writeHead(204, {
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": options.allowMethods,
    "Access-Control-Allow-Headers": options.allowHeaders
  });
  res.end();
}

/**
 * Reads and parses JSON request payloads with a strict size cap.
 */
export async function parseJsonBody(req) {
  let body = "";

  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) {
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
