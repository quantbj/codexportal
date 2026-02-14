/**
 * Formats a number to EUR currency in German locale.
 */
export function formatCurrency(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) {
    throw new Error("amount must be a finite number");
  }

  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(value);
}

/**
 * Converts raw form inputs into the backend quote request schema.
 */
export function normalizeQuoteRequest(rawInput) {
  const annualGenerationMWh = Number(rawInput.annualGenerationMWh);
  const installedCapacityKWp = Number(rawInput.installedCapacityKWp);
  const marketPremiumEurPerMWh = Number(rawInput.marketPremiumEurPerMWh);

  if (!rawInput.companyName || !rawInput.contactName || !rawInput.email || !rawInput.location) {
    throw new Error("All customer and asset fields are required");
  }

  if (!Number.isFinite(annualGenerationMWh) || !Number.isFinite(installedCapacityKWp) || !Number.isFinite(marketPremiumEurPerMWh)) {
    throw new Error("Numeric pricing fields are required");
  }

  // Keep API payload shape explicit to avoid accidental field drift.
  return {
    customer: {
      companyName: rawInput.companyName,
      contactName: rawInput.contactName,
      email: rawInput.email
    },
    asset: {
      location: rawInput.location,
      pricingModelId: "de-pv-standard-v1",
      annualGenerationMWh,
      installedCapacityKWp,
      profileType: rawInput.profileType,
      marketPremiumEurPerMWh
    }
  };
}
