import test from "node:test";
import assert from "node:assert/strict";

import { PricingEngine } from "../src/domain/pricing/PricingEngine.js";
import { PricingModelRepository } from "../src/domain/pricing/PricingModelRepository.js";
import { InMemoryQuoteRepository } from "../src/domain/quotes/InMemoryQuoteRepository.js";
import { QuoteService } from "../src/domain/quotes/QuoteService.js";

test("QuoteService creates quote with pricing snapshot", async () => {
  const service = new QuoteService(
    new PricingEngine(new PricingModelRepository()),
    new InMemoryQuoteRepository(),
    () => new Date("2026-02-13T12:00:00.000Z")
  );

  const quote = await service.requestQuote({
    customer: {
      companyName: "Solarpark GmbH",
      contactName: "Alex Meyer",
      email: "alex@example.com"
    },
    asset: {
      location: "DE-BY",
      pricingModelId: "de-pv-standard-v1",
      annualGenerationMWh: 300,
      installedCapacityKWp: 450,
      profileType: "mixed",
      marketPremiumEurPerMWh: 8
    }
  });

  assert.equal(quote.status, "REQUESTED");
  assert.equal(quote.customer.companyName, "Solarpark GmbH");
  assert.equal(quote.createdAt, "2026-02-13T12:00:00.000Z");
  assert.ok(quote.id);
  assert.equal(quote.pricing.financials.netRevenuePerMWh, 77);

  const fetched = service.getQuote(quote.id);
  assert.deepEqual(fetched, quote);
});

test("QuoteService rejects invalid email", async () => {
  const service = new QuoteService(
    new PricingEngine(new PricingModelRepository()),
    new InMemoryQuoteRepository()
  );

  await assert.rejects(
    service.requestQuote({
      customer: {
        companyName: "Solarpark GmbH",
        contactName: "Alex Meyer",
        email: "invalid"
      },
      asset: {
        location: "DE-BY",
        pricingModelId: "de-pv-standard-v1",
        annualGenerationMWh: 300,
        installedCapacityKWp: 450,
        profileType: "mixed",
        marketPremiumEurPerMWh: 8
      }
    }),
    /customer.email/
  );
});

test("QuoteService validates required quote id for retrieval", () => {
  const service = new QuoteService(
    new PricingEngine(new PricingModelRepository()),
    new InMemoryQuoteRepository()
  );

  assert.throws(() => service.getQuote(""), /quoteId is required/);
});

test("QuoteService validates required payload sections", async () => {
  const service = new QuoteService(
    new PricingEngine(new PricingModelRepository()),
    new InMemoryQuoteRepository()
  );

  await assert.rejects(service.requestQuote(null), /payload is required/);
  await assert.rejects(service.requestQuote({}), /customer is required/);
  await assert.rejects(service.requestQuote({ customer: {} }), /asset is required/);
  await assert.rejects(
    service.requestQuote({
        customer: {
          companyName: "",
          contactName: "Alex Meyer",
          email: "alex@example.com"
        },
        asset: {
          location: "DE-BY",
          pricingModelId: "de-pv-standard-v1",
          annualGenerationMWh: 300,
          installedCapacityKWp: 450,
          profileType: "mixed",
          marketPremiumEurPerMWh: 8
        }
      }),
    /customer.companyName/
  );
  await assert.rejects(
    service.requestQuote({
        customer: {
          companyName: "Solarpark GmbH",
          contactName: "Alex Meyer",
          email: "alex@example.com"
        },
        asset: {
          location: "",
          pricingModelId: "de-pv-standard-v1",
          annualGenerationMWh: 300,
          installedCapacityKWp: 450,
          profileType: "mixed",
          marketPremiumEurPerMWh: 8
        }
      }),
    /asset.location/
  );
});
