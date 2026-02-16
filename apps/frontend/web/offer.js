import { initContractParametersUI } from "./contract-form.js";
import { toGermanApiError, toGermanErrorMessage } from "./errors.js";
import { syncAdminNavVisibility } from "./auth-nav.js";

const PRICING_SCHEMA_STORAGE_KEY = "salesPortal.contractParameters.pricing";
const OFFER_SCHEMA_STORAGE_KEY = "salesPortal.contractParameters.offer";
const AUTH_TOKEN_STORAGE_KEY = "salesPortal.authToken";
const DEFAULT_API_BASE_URL = "https://codexportal-backend.onrender.com";
const CONTRACTS_SERVICE_BASE_URL = "https://codexportal-contracts.onrender.com";

const quoteResult = document.getElementById("quoteResult");
const authForm = document.getElementById("authForm");
const signupForm = document.getElementById("signupForm");
const authStatus = document.getElementById("authStatus");
const loadDraftsButton = document.getElementById("loadDraftsButton");
const logoutButton = document.getElementById("logoutButton");
const submitQuoteButton = document.getElementById("submitQuoteButton");
const saveDraftButton = document.getElementById("saveDraftButton");
const draftsList = document.getElementById("draftsList");
const offerFormSection = document.getElementById("offerFormSection");
let getContractParameters = () => ({});
// Keeps the current editable contract id so save/book updates the same record.
let activeDraftId = "";

await bootstrap();
applyAuthGate();

submitQuoteButton?.addEventListener("click", async () => {
  if (!ensureAuthenticatedForOfferAction()) {
    return;
  }

  try {
    const payload = buildQuotePayload();
    const response = await fetch(`${DEFAULT_API_BASE_URL}/api/quotes/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(await toGermanApiError(response, "Quote request failed"));
    }

    const quote = await response.json();
    quoteResult.textContent = `Anfrage ${quote.id} erstellt. Status: ${quote.status}`;

    const saved = await saveDraft({
      id: activeDraftId || undefined,
      status: "booked",
      schemaVersion: "v1",
      payload: {
        quote,
        contractParameters: payload.contractParameters,
        quoteInput: payload
      }
    });
    activeDraftId = saved.id || activeDraftId;
  } catch (error) {
    quoteResult.textContent = `Fehler: ${toGermanErrorMessage(error)}`;
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
      throw new Error(await toGermanApiError(response, "Login fehlgeschlagen"));
    }

    const session = await response.json();
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, session.token);
    authStatus.textContent = `Angemeldet als ${session.user.username} (${session.user.role}).`;
    await syncAdminNavVisibility();
    applyAuthGate();
    await loadDrafts();
  } catch (error) {
    authStatus.textContent = `Fehler: ${toGermanErrorMessage(error)}`;
  }
});

loadDraftsButton?.addEventListener("click", async () => {
  try {
    await loadDrafts();
  } catch (error) {
    authStatus.textContent = `Fehler: ${toGermanErrorMessage(error)}`;
  }
});

saveDraftButton?.addEventListener("click", async () => {
  if (!ensureAuthenticatedForOfferAction()) {
    return;
  }

  try {
    const payload = buildQuotePayload();
    const saved = await saveDraft({
      id: activeDraftId || undefined,
      status: "draft",
      schemaVersion: "v1",
      payload: {
        contractParameters: payload.contractParameters,
        quoteInput: payload
      }
    });
    activeDraftId = saved.id || activeDraftId;
    quoteResult.textContent = "Entwurf gespeichert.";
  } catch (error) {
    quoteResult.textContent = `Fehler: ${toGermanErrorMessage(error)}`;
  }
});

logoutButton?.addEventListener("click", async () => {
  await logoutFromContractsService();
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  authStatus.textContent = "Nicht angemeldet.";
  draftsList.innerHTML = "";
  await syncAdminNavVisibility();
  applyAuthGate();
});

signupForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = signupForm.signupUsername.value.trim();
  const password = signupForm.signupPassword.value;

  try {
    const signupResponse = await fetch(`${CONTRACTS_SERVICE_BASE_URL}/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (!signupResponse.ok) {
      throw new Error(await toGermanApiError(signupResponse, "Konto konnte nicht erstellt werden"));
    }

    const loginResponse = await fetch(`${CONTRACTS_SERVICE_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (!loginResponse.ok) {
      throw new Error(await toGermanApiError(loginResponse, "Login fehlgeschlagen"));
    }

    const session = await loginResponse.json();
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, session.token);
    authStatus.textContent = `Konto erstellt und angemeldet als ${session.user.username}.`;
    signupForm.reset();
    await syncAdminNavVisibility();
    applyAuthGate();
  } catch (error) {
    authStatus.textContent = `Fehler: ${toGermanErrorMessage(error)}`;
  }
});

async function bootstrap() {
  await syncAdminNavVisibility();
  const resumedDraft = await loadDraftFromQuery();
  const initialOfferParameters = resumedDraft?.payload?.contractParameters?.offer || loadOfferContractParameters();
  if (resumedDraft?.payload?.contractParameters?.pricing) {
    localStorage.setItem(PRICING_SCHEMA_STORAGE_KEY, JSON.stringify(resumedDraft.payload.contractParameters.pricing));
  }

  await initializeContractSchema(initialOfferParameters);
  activeDraftId = resumedDraft?.id || "";
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
    authStatus.textContent = `Fehler beim Laden: ${await toGermanApiError(response, "Unbekannt")}`;
    return null;
  }

  const draft = await response.json();
  authStatus.textContent = `Entwurf ${draft.id} geladen.`;
  return draft;
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

function buildQuotePayload() {
  const pricing = loadPricingContractParameters();
  const offer = getContractParameters();
  persistOfferContractParameters(offer);

  const customer = deriveCustomer(offer);
  const asset = deriveAsset(pricing, offer);

  return {
    customer,
    asset: {
      ...asset,
      pricingModelId: "de-pv-standard-v1"
    },
    contractParameters: { pricing, offer }
  };
}

function deriveCustomer(offer) {
  const companyName = String(offer?.counterparty?.company_name || "").trim();
  const firstContact = Array.isArray(offer?.contact_persons) ? offer.contact_persons[0] || {} : {};
  const contactName = [firstContact.first_name, firstContact.last_name].filter(Boolean).join(" ").trim() || companyName;
  const email = String(firstContact.email || offer?.counterparty?.communication?.email || "").trim();

  if (!companyName || !contactName || !email) {
    throw new Error("Kundendaten in Angebotsparametern sind unvollständig.");
  }

  return { companyName, contactName, email };
}

function deriveAsset(pricing, offer) {
  const technicalResources = getArray(pricing.technical_resources);
  const technicalResourcesCapacity = technicalResources
    .map((resource) => Number(resource?.installed_capacity))
    .filter((value) => Number.isFinite(value) && value > 0)
    .reduce((total, value) => total + value, 0);
  const parkCapacity = Number(offer?.park?.cumulative_inverter_capacity);
  const installedCapacityKWp = technicalResourcesCapacity > 0 ? technicalResourcesCapacity : parkCapacity;

  const technologies = technicalResources.map((resource) => resource?.technology).filter(Boolean);
  const hasWind = technologies.includes("wind");
  const hasPv = technologies.includes("photovoltaic");
  const profileType = hasWind && !hasPv ? "baseLoad" : hasPv && !hasWind ? "peakLoad" : "mixed";
  const specificYield = profileType === "baseLoad" ? 2.6 : profileType === "peakLoad" ? 1.0 : 1.4;
  const annualGenerationMWh = Number((installedCapacityKWp * specificYield).toFixed(3));
  const marketPremiumEurPerMWh = Number(
    pricing?.contract_items?.[0]?.remuneration_configuration?.feed_in_remuneration?.price
      || pricing?.contract_items?.[0]?.market_premium_eur_per_mwh
      || 5
  );
  const location = String(offer?.park?.control_area || offer?.park?.park_name || "DE").trim();

  if (!Number.isFinite(installedCapacityKWp) || installedCapacityKWp <= 0) {
    throw new Error("Preisparameter enthalten keine gültige installierte Leistung.");
  }

  return {
    location,
    annualGenerationMWh,
    installedCapacityKWp,
    profileType,
    marketPremiumEurPerMWh: Number.isFinite(marketPremiumEurPerMWh) ? marketPremiumEurPerMWh : 5
  };
}

function loadPricingContractParameters() {
  const raw = localStorage.getItem(PRICING_SCHEMA_STORAGE_KEY);
  if (!raw) {
    throw new Error("Es sind keine Preisparameter gespeichert. Bitte zuerst Seite 'Pricing' ausfüllen.");
  }

  try {
    return JSON.parse(raw) || {};
  } catch {
    throw new Error("Gespeicherte Preisparameter sind ungültig.");
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

function restoreAuthStatus() {
  if (getAuthToken()) {
    authStatus.textContent = "Token vorhanden. Angebotsparameter können bearbeitet werden.";
  }
}

function ensureAuthenticatedForOfferAction() {
  if (getAuthToken()) {
    return true;
  }

  authStatus.textContent = "Bitte anmelden, bevor Sie Vertragsparameter bearbeiten oder absenden.";
  quoteResult.textContent = "Anmeldung erforderlich.";
  authForm?.username?.focus();
  authForm?.scrollIntoView({ behavior: "smooth", block: "center" });
  return false;
}

function applyAuthGate() {
  const unlocked = Boolean(getAuthToken());
  offerFormSection?.querySelectorAll("input, select, textarea, button").forEach((element) => {
    element.disabled = !unlocked;
  });
  submitQuoteButton.disabled = !unlocked;
  saveDraftButton.disabled = !unlocked;
  offerFormSection?.classList.toggle("form-locked", !unlocked);
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
    throw new Error(await toGermanApiError(response, "Entwurf konnte nicht gespeichert werden"));
  }

  return response.json();
}

async function loadDrafts() {
  const token = getAuthToken();
  if (!token) {
    throw new Error("Bitte zuerst anmelden");
  }

  const response = await fetch(`${CONTRACTS_SERVICE_BASE_URL}/drafts`, {
    headers: { authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(await toGermanApiError(response, "Verträge konnten nicht geladen werden"));
  }

  const drafts = await response.json();
  renderDrafts(drafts);
}

function renderDrafts(drafts) {
  draftsList.innerHTML = "";

  if (!Array.isArray(drafts) || drafts.length === 0) {
    draftsList.textContent = "Keine gespeicherten Verträge.";
    return;
  }

  for (const draft of drafts) {
    const item = document.createElement("div");
    item.className = "draft-item";

    const label = document.createElement("div");
    const statusLabel = draft?.status === "booked" ? "Booked" : "Draft";
    label.textContent = `${draft.id} | Besitzer: ${draft.ownerUserId} | Status: ${statusLabel}`;

    const action = document.createElement("a");
    action.className = "button-link secondary";
    action.href = `./offer.html?draftId=${encodeURIComponent(draft.id)}`;
    action.textContent = "Weiter bearbeiten";

    item.appendChild(label);
    item.appendChild(action);
    draftsList.appendChild(item);
  }
}

function getArray(value) {
  return Array.isArray(value) ? value : [];
}
