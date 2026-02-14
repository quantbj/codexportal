import { randomUUID } from "node:crypto";

export class QuoteService {
  /**
   * @param {{ calculate: (input: object) => Promise<object> | object }} pricingEngine
   * @param {import("./InMemoryQuoteRepository.js").InMemoryQuoteRepository} quoteRepository
   * @param {() => Date} nowProvider
   */
  constructor(pricingEngine, quoteRepository, nowProvider = () => new Date()) {
    this.pricingEngine = pricingEngine;
    this.quoteRepository = quoteRepository;
    this.nowProvider = nowProvider;
  }

  /**
   * Validates a quote request, computes pricing, creates a quote aggregate,
   * and persists the result through the repository adapter.
   */
  async requestQuote(request) {
    validateQuoteRequest(request);

    const pricing = await this.pricingEngine.calculate(request.asset);
    const createdAt = this.nowProvider().toISOString();

    // Persist a snapshot so downstream offer/contract generation is reproducible.
    const quote = {
      id: randomUUID(),
      status: "REQUESTED",
      createdAt,
      customer: {
        companyName: request.customer.companyName,
        contactName: request.customer.contactName,
        email: request.customer.email
      },
      asset: {
        location: request.asset.location,
        annualGenerationMWh: request.asset.annualGenerationMWh,
        installedCapacityKWp: request.asset.installedCapacityKWp,
        profileType: request.asset.profileType
      },
      pricing
    };

    return this.quoteRepository.save(quote);
  }

  /**
   * Returns quote details for a known id.
   */
  getQuote(quoteId) {
    if (!quoteId) {
      throw new Error("quoteId is required");
    }

    return this.quoteRepository.getById(quoteId);
  }
}

/**
 * Validates a quote request payload before pricing and persistence.
 */
function validateQuoteRequest(request) {
  if (!request || typeof request !== "object") {
    throw new Error("Quote request payload is required");
  }

  if (!request.customer || typeof request.customer !== "object") {
    throw new Error("customer is required");
  }

  if (!request.asset || typeof request.asset !== "object") {
    throw new Error("asset is required");
  }

  const { companyName, contactName, email } = request.customer;
  if (!companyName || !contactName || !email) {
    throw new Error("customer.companyName, customer.contactName and customer.email are required");
  }

  if (!email.includes("@") || email.length < 5) {
    throw new Error("customer.email must be a valid email");
  }

  if (!request.asset.location || typeof request.asset.location !== "string") {
    throw new Error("asset.location is required");
  }
}
