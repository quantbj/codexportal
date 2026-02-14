import { InMemoryQuoteRepository } from "../domain/quotes/InMemoryQuoteRepository.js";
import { QuoteService } from "../domain/quotes/QuoteService.js";
import { HttpPricingClient } from "../integrations/pricing/HttpPricingClient.js";

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "https://codexportal-frontend.onrender.com";

/**
 * Composes HTTP routing with domain dependencies.
 * Dependency injection keeps tests deterministic and isolated.
 */
export function createRouter(dependencies = {}) {
  const quoteRepository = dependencies.quoteRepository || new InMemoryQuoteRepository();
  const pricingProvider = dependencies.pricingProvider || dependencies.pricingEngine || new HttpPricingClient();
  const quoteService = dependencies.quoteService || new QuoteService(pricingProvider, quoteRepository);

  return async function route(req, res) {
    try {
      // CORS preflight support for browser-based frontend calls.
      if (req.method === "OPTIONS") {
        sendJson(res, 204, {});
        return;
      }

      if (req.method === "GET" && req.url === "/health") {
        sendJson(res, 200, { status: "ok" });
        return;
      }

      if (req.method === "POST" && req.url === "/api/pricing/calculate") {
        // Calculator endpoint used by the portal's pricing step.
        const payload = await parseJsonBody(req);
        const result = await pricingProvider.calculate(payload);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === "POST" && req.url === "/api/quotes/request") {
        // Quote intake endpoint for the lead-to-offer flow.
        const payload = await parseJsonBody(req);
        const quote = await quoteService.requestQuote(payload);
        sendJson(res, 201, quote);
        return;
      }

      if (req.method === "GET" && req.url.startsWith("/api/quotes/")) {
        const quoteId = req.url.replace("/api/quotes/", "");
        const quote = quoteService.getQuote(quoteId);

        if (!quote) {
          sendJson(res, 404, { error: "Quote not found" });
          return;
        }

        sendJson(res, 200, quote);
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
  };
}

/**
 * Writes JSON response payloads with security and CORS headers.
 */
function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": FRONTEND_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

/**
 * Reads and validates JSON request payload with a hard size limit.
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
