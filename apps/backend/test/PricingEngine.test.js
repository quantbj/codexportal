import test from "node:test";
import assert from "node:assert/strict";

import { PricingEngine } from "../src/domain/pricing/PricingEngine.js";
import { PricingModelRepository } from "../src/domain/pricing/PricingModelRepository.js";

test("PricingEngine calculates deterministic financial breakdown", () => {
  const engine = new PricingEngine(new PricingModelRepository());

  const result = engine.calculate({
    pricingModelId: "de-pv-standard-v1",
    annualGenerationMWh: 500,
    installedCapacityKWp: 700,
    profileType: "mixed",
    marketPremiumEurPerMWh: 10
  });

  assert.equal(result.pricingModelId, "de-pv-standard-v1");
  assert.equal(result.financials.grossRevenue, 46000);
  assert.equal(result.financials.directMarketingFee, 4500);
  assert.equal(result.financials.balancingCost, 2000);
  assert.equal(result.financials.netRevenue, 39500);
  assert.equal(result.financials.netRevenuePerMWh, 79);
});

test("PricingEngine applies profile factor", () => {
  const engine = new PricingEngine(new PricingModelRepository());

  const mixed = engine.calculate({
    pricingModelId: "de-pv-standard-v1",
    annualGenerationMWh: 100,
    installedCapacityKWp: 120,
    profileType: "mixed",
    marketPremiumEurPerMWh: 0
  });

  const peak = engine.calculate({
    pricingModelId: "de-pv-standard-v1",
    annualGenerationMWh: 100,
    installedCapacityKWp: 120,
    profileType: "peakLoad",
    marketPremiumEurPerMWh: 0
  });

  assert.ok(peak.financials.netRevenue > mixed.financials.netRevenue);
});

test("PricingEngine validates unsupported profile", () => {
  const engine = new PricingEngine(new PricingModelRepository());

  assert.throws(() => {
    engine.calculate({
      pricingModelId: "de-pv-standard-v1",
      annualGenerationMWh: 100,
      installedCapacityKWp: 120,
      profileType: "invalid",
      marketPremiumEurPerMWh: 0
    });
  }, /profileType/);
});

test("PricingEngine fails when model does not exist", () => {
  const engine = new PricingEngine(new PricingModelRepository());

  assert.throws(() => {
    engine.calculate({
      pricingModelId: "unknown",
      annualGenerationMWh: 100,
      installedCapacityKWp: 120,
      profileType: "mixed",
      marketPremiumEurPerMWh: 0
    });
  }, /Unknown pricing model/);
});

test("PricingEngine validates object payload and required fields", () => {
  const engine = new PricingEngine(new PricingModelRepository());

  assert.throws(() => engine.calculate(null), /must be an object/);
  assert.throws(
    () =>
      engine.calculate({
        annualGenerationMWh: 100,
        installedCapacityKWp: 120,
        profileType: "mixed",
        marketPremiumEurPerMWh: 0
      }),
    /pricingModelId/
  );
  assert.throws(
    () =>
      engine.calculate({
        pricingModelId: "de-pv-standard-v1",
        annualGenerationMWh: -1,
        installedCapacityKWp: 120,
        profileType: "mixed",
        marketPremiumEurPerMWh: 0
      }),
    /annualGenerationMWh/
  );
  assert.throws(
    () =>
      engine.calculate({
        pricingModelId: "de-pv-standard-v1",
        annualGenerationMWh: 10,
        installedCapacityKWp: 0,
        profileType: "mixed",
        marketPremiumEurPerMWh: 0
      }),
    /installedCapacityKWp/
  );
  assert.throws(
    () =>
      engine.calculate({
        pricingModelId: "de-pv-standard-v1",
        annualGenerationMWh: 10,
        installedCapacityKWp: 10,
        profileType: "mixed",
        marketPremiumEurPerMWh: Number.NaN
      }),
    /marketPremiumEurPerMWh/
  );
});
