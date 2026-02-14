import { formatCurrency } from "./formatters.js";
import { initContractParametersUI } from "./contract-form.js";
import { toGermanApiError, toGermanErrorMessage } from "./errors.js";

const STORAGE_KEY = "salesPortal.latestPricing";
const PRICING_SCHEMA_STORAGE_KEY = "salesPortal.contractParameters.pricing";
const DEFAULT_API_BASE_URL = "https://codexportal-backend.onrender.com";

const calculatorForm = document.getElementById("calculatorForm");
const calculatorResult = document.getElementById("calculatorResult");
let getPricingContractParameters = () => ({});

/**
 * Restores the previous pricing input so users can continue where they left off.
 */
restorePricingInput();
initializePricingContractSchema();

/**
 * Runs pricing calculation and stores successful input for the offer page.
 */
calculatorForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    pricingModelId: "de-pv-standard-v1",
    annualGenerationMWh: Number(calculatorForm.annualGenerationMWh.value),
    installedCapacityKWp: Number(calculatorForm.installedCapacityKWp.value),
    profileType: calculatorForm.profileType.value,
    marketPremiumEurPerMWh: Number(calculatorForm.marketPremiumEurPerMWh.value)
  };

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/pricing/calculate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(await toGermanApiError(response, "Pricing request failed"));
    }

    const data = await response.json();
    calculatorResult.textContent = `Nettoerlös/Jahr: ${formatCurrency(data.financials.netRevenue)}`;

    // Persist pricing values so the offer page can prefill the asset fields.
    persistPricingInput({
      annualGenerationMWh: payload.annualGenerationMWh,
      installedCapacityKWp: payload.installedCapacityKWp,
      marketPremiumEurPerMWh: payload.marketPremiumEurPerMWh,
      profileType: payload.profileType
    });
    persistPricingContractParameters(getPricingContractParameters());
  } catch (error) {
    calculatorResult.textContent = `Fehler: ${toGermanErrorMessage(error)}`;
  }
});

/**
 * Applies saved pricing values to the calculator form.
 */
function restorePricingInput() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const value = JSON.parse(raw);
    setIfDefined(calculatorForm.annualGenerationMWh, value.annualGenerationMWh);
    setIfDefined(calculatorForm.installedCapacityKWp, value.installedCapacityKWp);
    setIfDefined(calculatorForm.marketPremiumEurPerMWh, value.marketPremiumEurPerMWh);
    setIfDefined(calculatorForm.profileType, value.profileType);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * Stores the latest valid pricing values for cross-page form prefill.
 */
function persistPricingInput(value) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

/**
 * Assigns form values only when a source value is present.
 */
function setIfDefined(input, value) {
  if (value === undefined || value === null || value === "") {
    return;
  }

  input.value = String(value);
}

/**
 * Returns backend base URL for API calls without exposing it in the UI.
 */
function getApiBaseUrl() {
  return DEFAULT_API_BASE_URL;
}

/**
 * Initializes schema-driven pricing parameters.
 */
async function initializePricingContractSchema() {
  const initialPricingParameters = loadPricingContractParameters();
  const contractUi = await initContractParametersUI({
    formRootId: "pricingSchemaForm",
    statusId: "pricingSchemaStatus",
    previewId: "pricingJsonPreview",
    schemaUrl: "./contract-pricing.json",
    initialValue: initialPricingParameters
  });
  getPricingContractParameters = contractUi.getValue;
}

/**
 * Persists contract pricing parameters for later offer submission.
 */
function persistPricingContractParameters(value) {
  localStorage.setItem(PRICING_SCHEMA_STORAGE_KEY, JSON.stringify(value || {}));
}

/**
 * Loads persisted pricing contract parameters from local storage.
 */
function loadPricingContractParameters() {
  const raw = localStorage.getItem(PRICING_SCHEMA_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}
