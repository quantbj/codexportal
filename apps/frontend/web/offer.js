import { normalizeQuoteRequest } from "./formatters.js";
import { initContractParametersUI } from "./contract-form.js";

const STORAGE_KEY = "salesPortal.latestPricing";
const PRICING_SCHEMA_STORAGE_KEY = "salesPortal.contractParameters.pricing";
const OFFER_SCHEMA_STORAGE_KEY = "salesPortal.contractParameters.offer";
const AUTH_TOKEN_STORAGE_KEY = "salesPortal.authToken";
const DEFAULT_API_BASE_URL = "http://localhost:3001";
const CONTRACTS_SERVICE_BASE_URL = "http://localhost:3020";

const quoteForm = document.getElementById("quoteForm");
const quoteResult = document.getElementById("quoteResult");
const authForm = document.getElementById("authForm");
const authStatus = document.getElementById("authStatus");
const loadDraftsButton = document.getElementById("loadDraftsButton");
const saveDraftButton = document.getElementById("saveDraftButton");
const draftsList = document.getElementById("draftsList");
let getContractParameters = () => ({});

await bootstrap();

quoteForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const payload = buildQuotePayload();

    const response = await fetch(`${getApiBaseUrl()}/api/quotes/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Quote request failed");
    }

    const quote = await response.json();
    quoteResult.textContent = `Anfrage ${quote.id} erstellt. Status: ${quote.status}`;

    persistPricingInput({
      annualGenerationMWh: payload.asset.annualGenerationMWh,
      installedCapacityKWp: payload.asset.installedCapacityKWp,
      marketPremiumEurPerMWh: payload.asset.marketPremiumEurPerMWh,
      profileType: payload.asset.profileType
    });

    if (getAuthToken()) {
      await saveDraft({
        schemaVersion: "v1",
        payload: {
          quote,
          contractParameters: payload.contractParameters,
          quoteInput: payload
        }
      });
    }
  } catch (error) {
    quoteResult.textContent = `Fehler: ${error.message}`;
  }
});

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = authForm.username.value.trim();
  const password = authForm.password.value;

  try {
    const response = await fetch(`${CONTRACTS_SERVICE_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Login fehlgeschlagen");
    }

    const session = await response.json();
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, session.token);
    authStatus.textContent = `Angemeldet als ${session.user.username} (${session.user.role}).`;
    await loadDrafts();
  } catch (error) {
    authStatus.textContent = `Fehler: ${error.message}`;
  }
});

loadDraftsButton?.addEventListener("click", async () => {
  try {
    await loadDrafts();
  } catch (error) {
    authStatus.textContent = `Fehler: ${error.message}`;
  }
});

saveDraftButton?.addEventListener("click", async () => {
  try {
    const payload = buildQuotePayload();
    await saveDraft({
      schemaVersion: "v1",
      payload: {
        contractParameters: payload.contractParameters,
        quoteInput: payload
      }
    });
    quoteResult.textContent = "Entwurf gespeichert.";
  } catch (error) {
    quoteResult.textContent = `Fehler: ${error.message}`;
  }
});

function buildQuotePayload() {
  const payload = normalizeQuoteRequest({
    companyName: quoteForm.companyName.value,
    contactName: quoteForm.contactName.value,
    email: quoteForm.email.value,
    location: quoteForm.location.value,
    annualGenerationMWh: quoteForm.annualGenerationMWh.value,
    installedCapacityKWp: quoteForm.installedCapacityKWp.value,
    marketPremiumEurPerMWh: quoteForm.marketPremiumEurPerMWh.value,
    profileType: quoteForm.profileType.value
  });

  const offerParameters = getContractParameters();
  persistOfferContractParameters(offerParameters);

  payload.contractParameters = {
    pricing: loadPricingContractParameters(),
    offer: offerParameters
  };

  return payload;
}

async function bootstrap() {
  const resumedDraft = await loadDraftFromQuery();
  restorePricingInput();

  if (resumedDraft?.payload?.quoteInput) {
    applyQuoteInputToForm(resumedDraft.payload.quoteInput);
  }

  const initialOfferParameters = resumedDraft?.payload?.contractParameters?.offer || loadOfferContractParameters();
  if (resumedDraft?.payload?.contractParameters?.pricing) {
    localStorage.setItem(PRICING_SCHEMA_STORAGE_KEY, JSON.stringify(resumedDraft.payload.contractParameters.pricing));
  }

  await initializeContractSchema(initialOfferParameters);
  restoreAuthStatus();
}

async function loadDraftFromQuery() {
  const url = new URL(window.location.href);
  const draftId = url.searchParams.get("draftId");
  if (!draftId) {
    return null;
  }

  const token = getAuthToken();
  if (!token) {
    authStatus.textContent = "Bitte anmelden, um einen Entwurf zu laden.";
    return null;
  }

  const response = await fetch(`${CONTRACTS_SERVICE_BASE_URL}/drafts/${draftId}`, {
    headers: { authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    const error = await response.json();
    authStatus.textContent = `Fehler beim Laden: ${error.error || "Unbekannt"}`;
    return null;
  }

  const draft = await response.json();
  authStatus.textContent = `Entwurf ${draft.id} geladen.`;
  return draft;
}

function applyQuoteInputToForm(quoteInput) {
  const customer = quoteInput.customer || {};
  const asset = quoteInput.asset || {};

  setIfDefined(quoteForm.companyName, customer.companyName);
  setIfDefined(quoteForm.contactName, customer.contactName);
  setIfDefined(quoteForm.email, customer.email);
  setIfDefined(quoteForm.location, asset.location);
  setIfDefined(quoteForm.annualGenerationMWh, asset.annualGenerationMWh);
  setIfDefined(quoteForm.installedCapacityKWp, asset.installedCapacityKWp);
  setIfDefined(quoteForm.marketPremiumEurPerMWh, asset.marketPremiumEurPerMWh);
  setIfDefined(quoteForm.profileType, asset.profileType);
}

function restorePricingInput() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const value = JSON.parse(raw);
    setIfDefined(quoteForm.annualGenerationMWh, value.annualGenerationMWh);
    setIfDefined(quoteForm.installedCapacityKWp, value.installedCapacityKWp);
    setIfDefined(quoteForm.marketPremiumEurPerMWh, value.marketPremiumEurPerMWh);
    setIfDefined(quoteForm.profileType, value.profileType);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function persistPricingInput(value) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function setIfDefined(input, value) {
  if (!input || value === undefined || value === null || value === "") {
    return;
  }

  input.value = String(value);
}

async function initializeContractSchema(initialValue = {}) {
  const contractUi = await initContractParametersUI({
    formRootId: "contractSchemaForm",
    statusId: "contractSchemaStatus",
    previewId: "contractJsonPreview",
    schemaUrl: "./contract-offer.json",
    initialValue
  });
  getContractParameters = contractUi.getValue;
}

function getApiBaseUrl() {
  return DEFAULT_API_BASE_URL;
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

function loadOfferContractParameters() {
  const raw = localStorage.getItem(OFFER_SCHEMA_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function persistOfferContractParameters(value) {
  localStorage.setItem(OFFER_SCHEMA_STORAGE_KEY, JSON.stringify(value || {}));
}

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || "";
}

function restoreAuthStatus() {
  if (getAuthToken()) {
    authStatus.textContent = "Token vorhanden. Anfragen können geladen werden.";
  }
}

async function saveDraft(draftPayload) {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Bitte zuerst anmelden, um Entwürfe zu speichern");
  }

  const response = await fetch(`${CONTRACTS_SERVICE_BASE_URL}/drafts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify(draftPayload)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Entwurf konnte nicht gespeichert werden");
  }

  return response.json();
}

async function loadDrafts() {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Bitte zuerst anmelden");
  }

  const response = await fetch(`${CONTRACTS_SERVICE_BASE_URL}/drafts`, {
    headers: {
      authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Anfragen konnten nicht geladen werden");
  }

  const drafts = await response.json();
  renderDrafts(drafts);
}

function renderDrafts(drafts) {
  draftsList.innerHTML = "";

  if (!Array.isArray(drafts) || drafts.length === 0) {
    draftsList.textContent = "Keine gespeicherten Anfragen.";
    return;
  }

  for (const draft of drafts) {
    const item = document.createElement("div");
    item.className = "draft-item";

    const label = document.createElement("div");
    label.textContent = `${draft.id} | Besitzer: ${draft.ownerUserId}`;

    const action = document.createElement("a");
    action.className = "button-link secondary";
    action.href = `./offer.html?draftId=${encodeURIComponent(draft.id)}`;
    action.textContent = "Weiter bearbeiten";

    item.appendChild(label);
    item.appendChild(action);
    draftsList.appendChild(item);
  }
}
