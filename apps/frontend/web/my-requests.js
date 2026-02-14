import { toGermanErrorMessage } from "./errors.js";
const AUTH_TOKEN_STORAGE_KEY = "salesPortal.authToken";
const CONTRACTS_SERVICE_BASE_URL = "https://codexportal-contracts.onrender.com";

const authForm = document.getElementById("authForm");
const authStatus = document.getElementById("authStatus");
const loadDraftsButton = document.getElementById("loadDraftsButton");
const logoutButton = document.getElementById("logoutButton");
const draftsList = document.getElementById("draftsList");

restoreAuthStatus();

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const response = await fetch(`${CONTRACTS_SERVICE_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: authForm.username.value.trim(),
        password: authForm.password.value
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(toGermanErrorMessage(error.error || "Login fehlgeschlagen"));
    }

    const session = await response.json();
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, session.token);
    authStatus.textContent = `Angemeldet als ${session.user.username} (${session.user.role}).`;
    await loadDrafts();
  } catch (error) {
    authStatus.textContent = `Fehler: ${toGermanErrorMessage(error)}`;
  }
});

loadDraftsButton.addEventListener("click", async () => {
  try {
    await loadDrafts();
  } catch (error) {
    authStatus.textContent = `Fehler: ${toGermanErrorMessage(error)}`;
  }
});

logoutButton.addEventListener("click", () => {
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  draftsList.innerHTML = "";
  authStatus.textContent = "Nicht angemeldet.";
});

async function loadDrafts() {
  const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (!token) {
    throw new Error("Bitte zuerst anmelden");
  }

  const response = await fetch(`${CONTRACTS_SERVICE_BASE_URL}/drafts`, {
    headers: { authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(toGermanErrorMessage(error.error || "Anfragen konnten nicht geladen werden"));
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

    const details = document.createElement("div");
    details.textContent = `${draft.id} | Besitzer: ${draft.ownerUserId} | Update: ${draft.updatedAt || "-"}`;

    const resume = document.createElement("a");
    resume.className = "button-link secondary";
    resume.href = `./offer.html?draftId=${encodeURIComponent(draft.id)}`;
    resume.textContent = "Weiter bearbeiten";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger-button";
    remove.textContent = "Löschen";
    remove.addEventListener("click", async () => {
      try {
        await deleteDraft(draft.id);
        await loadDrafts();
      } catch (error) {
        authStatus.textContent = `Fehler: ${toGermanErrorMessage(error)}`;
      }
    });

    const actions = document.createElement("div");
    actions.className = "draft-actions";
    actions.appendChild(resume);
    actions.appendChild(remove);

    item.appendChild(details);
    item.appendChild(actions);
    draftsList.appendChild(item);
  }
}

async function deleteDraft(draftId) {
  const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (!token) {
    throw new Error("Bitte zuerst anmelden");
  }

  const response = await fetch(`${CONTRACTS_SERVICE_BASE_URL}/drafts/${encodeURIComponent(draftId)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(toGermanErrorMessage(error.error || "Anfrage konnte nicht gelöscht werden"));
  }
}

function restoreAuthStatus() {
  if (localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)) {
    authStatus.textContent = "Token vorhanden. Anfragen können geladen werden.";
    loadDrafts().catch(() => {
      authStatus.textContent = "Token vorhanden, Laden fehlgeschlagen. Bitte neu anmelden.";
    });
  }
}
