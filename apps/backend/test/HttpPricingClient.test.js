import test from "node:test";
import assert from "node:assert/strict";

import { HttpPricingClient } from "../src/integrations/pricing/HttpPricingClient.js";

test("HttpPricingClient sends payload and returns pricing response", async () => {
  let calledUrl = "";
  let calledBody = "";

  const client = new HttpPricingClient({
    baseUrl: "http://pricing-service.local",
    fetchImpl: async (url, init) => {
      calledUrl = String(url);
      calledBody = String(init.body);
      return {
        ok: true,
        json: async () => ({ financials: { netRevenue: 123 } })
      };
    }
  });

  const result = await client.calculate({ pricingModelId: "de-pv-standard-v1" });

  assert.equal(calledUrl, "http://pricing-service.local/api/pricing/calculate");
  assert.ok(calledBody.includes("de-pv-standard-v1"));
  assert.equal(result.financials.netRevenue, 123);
});

test("HttpPricingClient exposes service error payload", async () => {
  const client = new HttpPricingClient({
    baseUrl: "http://pricing-service.local",
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: "annualGenerationMWh must be positive" })
    })
  });

  await assert.rejects(
    client.calculate({}),
    /Pricing service request failed: annualGenerationMWh must be positive/
  );
});

test("HttpPricingClient handles non-json error responses", async () => {
  const client = new HttpPricingClient({
    baseUrl: "http://pricing-service.local",
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error("invalid json");
      }
    })
  });

  await assert.rejects(client.calculate({}), /Pricing service request failed: HTTP 503/);
});
