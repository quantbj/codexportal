import { PricingEngine } from "./PricingEngine.js";
import { PricingModelRepository } from "./PricingModelRepository.js";

/**
 * Creates the external pricing service router.
 */
export function createRouter(dependencies = {}) {
  const pricingRepository = dependencies.pricingRepository || new PricingModelRepository();
  const pricingEngine = dependencies.pricingEngine || new PricingEngine(pricingRepository);

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

      if (req.method === "POST" && req.url === "/api/pricing/calculate") {
        const payload = await parseJsonBody(req);
        const result = pricingEngine.calculate(payload);
        sendJson(res, 200, result);
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
  };
}

/**
 * Writes JSON response payloads with security headers.
 */
function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

/**
 * Parses JSON body with a hard payload limit.
 */
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
