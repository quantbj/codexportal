import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import { createRouter } from "../src/router.js";

async function invokeRoute({ method, url, payload }) {
  const router = createRouter();
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

test("pricing-service health endpoint returns OK", async () => {
  const response = await invokeRoute({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { status: "ok" });
});

test("pricing-service calculates pricing", async () => {
  const response = await invokeRoute({
    method: "POST",
    url: "/api/pricing/calculate",
    payload: {
      pricingModelId: "de-pv-standard-v1",
      annualGenerationMWh: 400,
      installedCapacityKWp: 500,
      profileType: "mixed",
      marketPremiumEurPerMWh: 5
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.financials.netRevenuePerMWh, 74);
});

test("pricing-service validates input", async () => {
  const response = await invokeRoute({
    method: "POST",
    url: "/api/pricing/calculate",
    payload: {
      pricingModelId: "de-pv-standard-v1",
      annualGenerationMWh: -1,
      installedCapacityKWp: 500,
      profileType: "mixed",
      marketPremiumEurPerMWh: 5
    }
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /annualGenerationMWh/);
});

test("pricing-service handles preflight", async () => {
  const response = await invokeRoute({ method: "OPTIONS", url: "/api/pricing/calculate" });
  assert.equal(response.statusCode, 204);
  assert.equal(response.headers["X-Content-Type-Options"], "nosniff");
});

test("pricing-service returns 404 for unknown route", async () => {
  const response = await invokeRoute({ method: "GET", url: "/unknown" });
  assert.equal(response.statusCode, 404);
  assert.equal(response.body.error, "Not found");
});

test("pricing-service returns 400 for missing body", async () => {
  const response = await invokeRoute({ method: "POST", url: "/api/pricing/calculate" });
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, "Request body is required");
});

test("pricing-service returns 400 for invalid JSON payload", async () => {
  const router = createRouter();
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
