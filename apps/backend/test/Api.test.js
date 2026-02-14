import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import { createRouter } from "../src/http/router.js";
import { PricingEngine } from "../src/domain/pricing/PricingEngine.js";
import { PricingModelRepository } from "../src/domain/pricing/PricingModelRepository.js";

function createTestRouter() {
  const pricingProvider = new PricingEngine(new PricingModelRepository());
  return createRouter({ pricingProvider });
}

async function invokeRoute({ method, url, payload, router = createTestRouter() }) {
  const req = Readable.from(payload ? [JSON.stringify(payload)] : []);
  req.method = method;
  req.url = url;

  let statusCode = 200;
  let responseBody = "";
  const headers = {};

  const res = {
    writeHead(code, nextHeaders) {
      statusCode = code;
      Object.assign(headers, nextHeaders);
    },
    end(value) {
      responseBody = value || "";
    }
  };

  await router(req, res);

  return {
    statusCode,
    headers,
    body: responseBody ? JSON.parse(responseBody) : {}
  };
}

test("GET /health returns OK", async () => {
  const response = await invokeRoute({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { status: "ok" });
  assert.equal(response.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(response.headers["Access-Control-Allow-Origin"], "http://localhost:3000");
});

test("pricing and quote flow works end-to-end", async () => {
  const router = createTestRouter();
  const pricingResponse = await invokeRoute({
    method: "POST",
    url: "/api/pricing/calculate",
    router,
    payload: {
      pricingModelId: "de-pv-standard-v1",
      annualGenerationMWh: 400,
      installedCapacityKWp: 500,
      profileType: "mixed",
      marketPremiumEurPerMWh: 5
    }
  });

  assert.equal(pricingResponse.statusCode, 200);
  assert.equal(pricingResponse.body.financials.netRevenuePerMWh, 74);

  const quoteResponse = await invokeRoute({
    method: "POST",
    url: "/api/quotes/request",
    router,
    payload: {
      customer: {
        companyName: "PV Projekt AG",
        contactName: "Jordan Beck",
        email: "jordan@example.com"
      },
      asset: {
        location: "DE-HE",
        pricingModelId: "de-pv-standard-v1",
        annualGenerationMWh: 400,
        installedCapacityKWp: 500,
        profileType: "mixed",
        marketPremiumEurPerMWh: 5
      }
    }
  });

  assert.equal(quoteResponse.statusCode, 201);
  assert.equal(quoteResponse.body.status, "REQUESTED");

  const quoteId = quoteResponse.body.id;
  const getResponse = await invokeRoute({ method: "GET", url: `/api/quotes/${quoteId}`, router });
  assert.equal(getResponse.statusCode, 200);
  assert.equal(getResponse.body.customer.companyName, "PV Projekt AG");
});

test("API returns 400 for invalid JSON", async () => {
  const router = createTestRouter();
  const req = Readable.from(["{bad}"]);
  req.method = "POST";
  req.url = "/api/pricing/calculate";

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
});

test("API returns 404 for unknown quote id", async () => {
  const response = await invokeRoute({ method: "GET", url: "/api/quotes/not-found" });
  assert.equal(response.statusCode, 404);
  assert.equal(response.body.error, "Quote not found");
});

test("API returns 404 for unknown route", async () => {
  const response = await invokeRoute({ method: "GET", url: "/unknown" });
  assert.equal(response.statusCode, 404);
  assert.equal(response.body.error, "Not found");
});

test("API returns 400 for missing body", async () => {
  const response = await invokeRoute({ method: "POST", url: "/api/pricing/calculate" });
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, "Request body is required");
});

test("API returns 400 for payload too large", async () => {
  const router = createTestRouter();
  const req = Readable.from(["x".repeat((1024 * 1024) + 1)]);
  req.method = "POST";
  req.url = "/api/pricing/calculate";

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
  assert.equal(JSON.parse(body).error, "Payload too large");
});

test("API handles CORS preflight", async () => {
  const response = await invokeRoute({ method: "OPTIONS", url: "/api/pricing/calculate" });
  assert.equal(response.statusCode, 204);
  assert.equal(response.headers["Access-Control-Allow-Origin"], "http://localhost:3000");
  assert.equal(response.headers["Access-Control-Allow-Methods"], "GET,POST,OPTIONS");
});
