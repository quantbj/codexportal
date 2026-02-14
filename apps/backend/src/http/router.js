import { InMemoryQuoteRepository } from "../domain/quotes/InMemoryQuoteRepository.js";
import { QuoteService } from "../domain/quotes/QuoteService.js";
import { HttpPricingClient } from "../integrations/pricing/HttpPricingClient.js";
import { createCorsOriginResolver, parseJsonBody, sendJson, sendPreflight } from "./httpUtils.js";

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "https://codexportal-frontend.onrender.com";

/**
 * Composes HTTP routing with domain dependencies.
 * Dependency injection keeps tests deterministic and isolated.
 */
export function createRouter(dependencies = {}) {
  const quoteRepository = dependencies.quoteRepository || new InMemoryQuoteRepository();
  const pricingProvider = dependencies.pricingProvider || dependencies.pricingEngine || new HttpPricingClient();
  const quoteService = dependencies.quoteService || new QuoteService(pricingProvider, quoteRepository);
  const corsOptions = {
    allowMethods: "GET,POST,OPTIONS",
    allowHeaders: "Content-Type",
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

      if (req.method === "POST" && req.url === "/api/pricing/calculate") {
        const payload = await parseJsonBody(req);
        const result = await pricingProvider.calculate(payload);
        sendJson(req, res, 200, result, corsOptions);
        return;
      }

      if (req.method === "POST" && req.url === "/api/quotes/request") {
        const payload = await parseJsonBody(req);
        const quote = await quoteService.requestQuote(payload);
        sendJson(req, res, 201, quote, corsOptions);
        return;
      }

      if (req.method === "GET" && req.url.startsWith("/api/quotes/")) {
        const quoteId = req.url.replace("/api/quotes/", "");
        const quote = quoteService.getQuote(quoteId);

        if (!quote) {
          sendJson(req, res, 404, { error: "Quote not found" }, corsOptions);
          return;
        }

        sendJson(req, res, 200, quote, corsOptions);
        return;
      }

      sendJson(req, res, 404, { error: "Not found" }, corsOptions);
    } catch (error) {
      sendJson(req, res, 400, { error: error.message }, corsOptions);
    }
  };
}
