const SUPPORTED_PROFILES = new Set(["baseLoad", "peakLoad", "mixed"]);

export class PricingEngine {
  /**
   * @param {import("./PricingModelRepository.js").PricingModelRepository} modelRepository
   */
  constructor(modelRepository) {
    this.modelRepository = modelRepository;
  }

  /**
   * Calculates gross and net contract economics using the requested model
   * and an input snapshot that can later be audited.
   */
  calculate(input) {
    validateInput(input);

    const model = this.modelRepository.getById(input.pricingModelId);
    if (!model) {
      throw new Error(`Unknown pricing model: ${input.pricingModelId}`);
    }

    // Compute market-driven price and per-MWh net after fixed fees/costs.
    const profileFactor = model.profileAdjustmentFactor[input.profileType];
    const effectiveMarketPrice = (model.marketBasePriceEurPerMWh + input.marketPremiumEurPerMWh) * profileFactor;
    const netPrice = effectiveMarketPrice - model.directMarketingFeeEurPerMWh - model.balancingCostEurPerMWh;

    // Scale per-MWh values to annual values.
    const grossRevenue = roundCurrency(input.annualGenerationMWh * effectiveMarketPrice);
    const directMarketingFee = roundCurrency(input.annualGenerationMWh * model.directMarketingFeeEurPerMWh);
    const balancingCost = roundCurrency(input.annualGenerationMWh * model.balancingCostEurPerMWh);
    const netRevenue = roundCurrency(input.annualGenerationMWh * netPrice);

    return {
      pricingModelId: model.id,
      assumptions: {
        marketBasePriceEurPerMWh: model.marketBasePriceEurPerMWh,
        profileFactor,
        marketPremiumEurPerMWh: input.marketPremiumEurPerMWh,
        directMarketingFeeEurPerMWh: model.directMarketingFeeEurPerMWh,
        balancingCostEurPerMWh: model.balancingCostEurPerMWh
      },
      inputSnapshot: {
        annualGenerationMWh: input.annualGenerationMWh,
        installedCapacityKWp: input.installedCapacityKWp,
        profileType: input.profileType
      },
      financials: {
        grossRevenue,
        directMarketingFee,
        balancingCost,
        netRevenue,
        netRevenuePerMWh: roundCurrency(netPrice)
      }
    };
  }
}

/**
 * Validates pricing input before running deterministic financial calculations.
 */
function validateInput(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Pricing input must be an object");
  }

  if (!input.pricingModelId || typeof input.pricingModelId !== "string") {
    throw new Error("pricingModelId is required");
  }

  if (!Number.isFinite(input.annualGenerationMWh) || input.annualGenerationMWh <= 0) {
    throw new Error("annualGenerationMWh must be a positive number");
  }

  if (!Number.isFinite(input.installedCapacityKWp) || input.installedCapacityKWp <= 0) {
    throw new Error("installedCapacityKWp must be a positive number");
  }

  if (!SUPPORTED_PROFILES.has(input.profileType)) {
    throw new Error("profileType must be one of baseLoad, peakLoad, mixed");
  }

  if (!Number.isFinite(input.marketPremiumEurPerMWh)) {
    throw new Error("marketPremiumEurPerMWh must be a number");
  }
}

/**
 * Rounds currency values to two decimals for stable API responses.
 */
function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}
