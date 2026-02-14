export class PricingModelRepository {
  /**
   * In-memory pricing model store. This acts as a simple adapter until
   * persistent storage (for example PostgreSQL) is introduced.
   */
  constructor() {
    this.models = new Map();

    // Default model for German photovoltaic direct-marketing quotes.
    this.models.set("de-pv-standard-v1", {
      id: "de-pv-standard-v1",
      locale: "DE",
      assetType: "photovoltaik",
      marketBasePriceEurPerMWh: 82,
      directMarketingFeeEurPerMWh: 9,
      balancingCostEurPerMWh: 4,
      profileAdjustmentFactor: {
        baseLoad: 0.92,
        peakLoad: 1.03,
        mixed: 1
      },
      validFrom: "2026-01-01"
    });
  }

  /**
   * Returns a pricing model by identifier or null if no model exists.
   */
  getById(modelId) {
    return this.models.get(modelId) || null;
  }
}
