import { formatCurrency } from "./formatters.js";
import { initContractParametersUI } from "./contract-form.js";
import { toGermanApiError, toGermanErrorMessage } from "./errors.js";
import { syncAdminNavVisibility } from "./auth-nav.js";

const PRICING_SCHEMA_STORAGE_KEY = "salesPortal.contractParameters.pricing";
const AUTH_TOKEN_STORAGE_KEY = "salesPortal.authToken";
const DEFAULT_API_BASE_URL = "https://codexportal-backend.onrender.com";
const CONTRACTS_SERVICE_BASE_URL = "https://codexportal-contracts.onrender.com";

const calculatorResult = document.getElementById("calculatorResult");
const calculatePriceButton = document.getElementById("calculatePriceButton");
const authForm = document.getElementById("authForm");
const authStatus = document.getElementById("authStatus");
const logoutButton = document.getElementById("logoutButton");
const pricingFormSection = document.getElementById("pricingFormSection");
let getPricingContractParameters = () => ({});

await initializePricingContractSchema();
await syncAdminNavVisibility();
applyAuthGate();
restoreAuthStatus();

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await login();
});

logoutButton?.addEventListener("click", async () => {
  await logoutFromContractsService();
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  authStatus.textContent = "Nicht angemeldet.";
  await syncAdminNavVisibility();
  applyAuthGate();
});

calculatePriceButton?.addEventListener("click", async () => {
  if (!ensureAuthenticated()) {
    return;
  }

  try {
    const pricingParameters = getPricingContractParameters();
    const payload = buildPricingPayload(pricingParameters);

    const response = await fetch(`${DEFAULT_API_BASE_URL}/api/pricing/calculate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(await toGermanApiError(response, "Pricing request failed"));
    }

    const data = await response.json();
    calculatorResult.textContent = `Nettoerlös/Jahr: ${formatCurrency(data.financials.netRevenue)}`;
    persistPricingContractParameters(pricingParameters);
  } catch (error) {
    calculatorResult.textContent = `Fehler: ${toGermanErrorMessage(error)}`;
  }
});

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

async function login() {
  const username = authForm.username.value.trim();
  const password = authForm.password.value;

  try {
    const response = await fetch(`${CONTRACTS_SERVICE_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      throw new Error(await toGermanApiError(response, "Login fehlgeschlagen"));
    }

    const session = await response.json();
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, session.token);
    authStatus.textContent = `Angemeldet als ${session.user.username} (${session.user.role}).`;
    await syncAdminNavVisibility();
    applyAuthGate();
  } catch (error) {
    authStatus.textContent = `Fehler: ${toGermanErrorMessage(error)}`;
  }
}

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || "";
}

async function logoutFromContractsService() {
  const token = getAuthToken();
  if (!token) {
    return;
  }

  try {
    await fetch(`${CONTRACTS_SERVICE_BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` }
    });
  } catch {
    // Local logout should still complete even if server logout is unavailable.
  }
}

function ensureAuthenticated() {
  if (getAuthToken()) {
    return true;
  }

  authStatus.textContent = "Bitte anmelden, bevor Sie Parameter bearbeiten oder Preise berechnen.";
  calculatorResult.textContent = "Anmeldung erforderlich.";
  authForm?.username?.focus();
  authForm?.scrollIntoView({ behavior: "smooth", block: "center" });
  return false;
}

function restoreAuthStatus() {
  if (getAuthToken()) {
    authStatus.textContent = "Angemeldet. Parameter können bearbeitet werden.";
  }
}

function applyAuthGate() {
  const unlocked = Boolean(getAuthToken());
  const lockableElements = pricingFormSection?.querySelectorAll("input, select, textarea, button");
  lockableElements?.forEach((element) => {
    if (element.id !== "calculatePriceButton") {
      element.disabled = !unlocked;
    }
  });

  if (calculatePriceButton) {
    calculatePriceButton.disabled = !unlocked;
  }

  pricingFormSection?.classList.toggle("form-locked", !unlocked);
}

function persistPricingContractParameters(value) {
  localStorage.setItem(PRICING_SCHEMA_STORAGE_KEY, JSON.stringify(value || {}));
}

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

function buildPricingPayload(pricingParameters) {
  const installedCapacityKWp = deriveInstalledCapacity(pricingParameters);
  const profileType = deriveProfileType(pricingParameters);
  const marketPremiumEurPerMWh = deriveMarketPremium(pricingParameters);
  const annualGenerationMWh = deriveAnnualGenerationMWh(pricingParameters, installedCapacityKWp, profileType);

  if (!Number.isFinite(installedCapacityKWp) || installedCapacityKWp <= 0) {
    throw new Error("Installierte Leistung konnte nicht aus den Vertragsparametern abgeleitet werden.");
  }

  if (!Number.isFinite(annualGenerationMWh) || annualGenerationMWh <= 0) {
    throw new Error("Jahreserzeugung konnte nicht aus den Vertragsparametern abgeleitet werden.");
  }

  return {
    pricingModelId: "de-pv-standard-v1",
    annualGenerationMWh,
    installedCapacityKWp,
    profileType,
    marketPremiumEurPerMWh
  };
}

function deriveInstalledCapacity(pricingParameters) {
  const technicalResources = getArray(pricingParameters.technical_resources);
  const summedInstalledCapacity = technicalResources
    .map((resource) => Number(resource?.installed_capacity))
    .filter((value) => Number.isFinite(value) && value > 0)
    .reduce((total, value) => total + value, 0);

  if (summedInstalledCapacity > 0) {
    return summedInstalledCapacity;
  }

  return NaN;
}

function deriveProfileType(pricingParameters) {
  const technologies = getArray(pricingParameters.technical_resources)
    .map((resource) => resource?.technology)
    .filter(Boolean);

  if (technologies.length === 0) {
    return "mixed";
  }

  const hasWind = technologies.includes("wind");
  const hasPv = technologies.includes("photovoltaic");

  if (hasWind && !hasPv) {
    return "baseLoad";
  }

  if (hasPv && !hasWind) {
    return "peakLoad";
  }

  return "mixed";
}

function deriveAnnualGenerationMWh(pricingParameters, installedCapacityKWp, profileType) {
  const specificYieldByProfile = {
    peakLoad: 1.0,
    baseLoad: 2.6,
    mixed: 1.4
  };
  return Number((installedCapacityKWp * specificYieldByProfile[profileType]).toFixed(3));
}

function deriveMarketPremium(pricingParameters) {
  const firstContractItem = getArray(pricingParameters.contract_items)[0] || {};
  const remuneration = firstContractItem?.remuneration_configuration || {};
  const compensation = remuneration?.market_based_compensation || {};

  const candidates = [
    compensation.compensation_type_amount,
    remuneration?.feed_in_remuneration?.price,
    firstContractItem?.market_premium_eur_per_mwh
  ];

  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return 5;
}

function getArray(value) {
  return Array.isArray(value) ? value : [];
}
