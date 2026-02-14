import test from "node:test";
import assert from "node:assert/strict";

import { PricingEngine } from "../src/PricingEngine.js";
import { PricingModelRepository } from "../src/PricingModelRepository.js";

test("PricingEngine calculates deterministic financial breakdown", () => {
  const engine = new PricingEngine(new PricingModelRepository());

  const result = engine.calculate({
    pricingModelId: "de-pv-standard-v1",
    annualGenerationMWh: 500,
    installedCapacityKWp: 700,
    profileType: "mixed",
    marketPremiumEurPerMWh: 10
  });

  assert.equal(result.financials.netRevenuePerMWh, 79);
  assert.equal(result.financials.netRevenue, 39500);
});

test("PricingEngine validates fields and rejects unknown models", () => {
  const engine = new PricingEngine(new PricingModelRepository());

  assert.throws(() => engine.calculate(null), /must be an object/);
  assert.throws(
    () =>
      engine.calculate({
        pricingModelId: "de-pv-standard-v1",
        annualGenerationMWh: -1,
        installedCapacityKWp: 100,
        profileType: "mixed",
        marketPremiumEurPerMWh: 5
      }),
    /annualGenerationMWh/
  );
  assert.throws(
    () =>
      engine.calculate({
        pricingModelId: "de-pv-standard-v1",
        annualGenerationMWh: 100,
        installedCapacityKWp: 0,
        profileType: "mixed",
        marketPremiumEurPerMWh: 5
      }),
    /installedCapacityKWp/
  );
  assert.throws(
    () =>
      engine.calculate({
        pricingModelId: "de-pv-standard-v1",
        annualGenerationMWh: 100,
        installedCapacityKWp: 100,
        profileType: "invalid",
        marketPremiumEurPerMWh: 5
      }),
    /profileType/
  );
  assert.throws(
    () =>
      engine.calculate({
        pricingModelId: "de-pv-standard-v1",
        annualGenerationMWh: 100,
        installedCapacityKWp: 100,
        profileType: "mixed",
        marketPremiumEurPerMWh: Number.NaN
      }),
    /marketPremiumEurPerMWh/
  );
  assert.throws(
    () =>
      engine.calculate({
        pricingModelId: "unknown",
        annualGenerationMWh: 100,
        installedCapacityKWp: 100,
        profileType: "mixed",
        marketPremiumEurPerMWh: 5
      }),
    /Unknown pricing model/
  );
});
