import test from "node:test";
import assert from "node:assert/strict";

import { formatCurrency, normalizeQuoteRequest } from "../web/formatters.js";

test("formatCurrency returns eur localized amount", () => {
  const value = formatCurrency(1234.5);
  assert.equal(typeof value, "string");
  assert.ok(value.includes("1.234"));
});

test("formatCurrency validates input", () => {
  assert.throws(() => formatCurrency(Number.NaN), /finite number/);
});

test("normalizeQuoteRequest maps input to API payload", () => {
  const payload = normalizeQuoteRequest({
    companyName: "Solar AG",
    contactName: "Pat Doe",
    email: "pat@example.com",
    location: "DE-NW",
    annualGenerationMWh: "600",
    installedCapacityKWp: "700",
    marketPremiumEurPerMWh: "6",
    profileType: "mixed"
  });

  assert.equal(payload.customer.companyName, "Solar AG");
  assert.equal(payload.asset.annualGenerationMWh, 600);
  assert.equal(payload.asset.installedCapacityKWp, 700);
  assert.equal(payload.asset.pricingModelId, "de-pv-standard-v1");
});

test("normalizeQuoteRequest validates required fields", () => {
  assert.throws(() => {
    normalizeQuoteRequest({
      companyName: "",
      contactName: "Pat Doe",
      email: "pat@example.com",
      location: "DE-NW",
      annualGenerationMWh: "600",
      installedCapacityKWp: "700",
      marketPremiumEurPerMWh: "6",
      profileType: "mixed"
    });
  }, /required/);
});
