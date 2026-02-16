import { toGermanApiError, toGermanErrorMessage } from "./errors.js";
import { syncAdminNavVisibility } from "./auth-nav.js";
const AUTH_TOKEN_STORAGE_KEY = "salesPortal.authToken";
const CONTRACTS_SERVICE_BASE_URL = "https://codexportal-contracts.onrender.com";

const authForm = document.getElementById("authForm");
const authStatus = document.getElementById("authStatus");
const loadDraftsButton = document.getElementById("loadDraftsButton");
const logoutButton = document.getElementById("logoutButton");
const draftsList = document.getElementById("draftsList");
const bookedList = document.getElementById("bookedList");

await syncAdminNavVisibility();
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
      throw new Error(await toGermanApiError(response, "Login fehlgeschlagen"));
    }

    const session = await response.json();
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, session.token);
    authStatus.textContent = `Angemeldet als ${session.user.username} (${session.user.role}).`;
    await syncAdminNavVisibility();
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

logoutButton.addEventListener("click", async () => {
  await logoutFromContractsService();
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  draftsList.innerHTML = "";
  authStatus.textContent = "Nicht angemeldet.";
  await syncAdminNavVisibility();
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
    throw new Error(await toGermanApiError(response, "Verträge konnten nicht geladen werden"));
  }

  const drafts = await response.json();
  renderDrafts(drafts);
}

async function logoutFromContractsService() {
  const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
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

function renderDrafts(drafts) {
  draftsList.innerHTML = "";
  bookedList.innerHTML = "";

  if (!Array.isArray(drafts) || drafts.length === 0) {
    draftsList.textContent = "Keine Draft-Verträge.";
    bookedList.textContent = "Keine Booked-Verträge.";
    return;
  }

  // Legacy records without an explicit status are treated as drafts.
  const draftContracts = drafts.filter((entry) => normalizeContractStatus(entry.status) === "draft");
  const bookedContracts = drafts.filter((entry) => normalizeContractStatus(entry.status) === "booked");
  draftsList.appendChild(buildContractsTable(draftContracts, "Keine Draft-Verträge."));
  bookedList.appendChild(buildContractsTable(bookedContracts, "Keine Booked-Verträge."));
}

function buildContractsTable(contracts, emptyMessage) {
  if (!contracts.length) {
    const empty = document.createElement("div");
    empty.className = "draft-item";
    empty.textContent = emptyMessage;
    return empty;
  }

  const table = document.createElement("table");
  table.className = "contracts-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>ID</th>
        <th>Besitzer</th>
        <th>Update</th>
        <th>Aktion</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");
  for (const contract of contracts) {
    const row = document.createElement("tr");

    const idCell = document.createElement("td");
    idCell.textContent = contract.id || "-";

    const ownerCell = document.createElement("td");
    ownerCell.textContent = contract.ownerUserId || "-";

    const updatedCell = document.createElement("td");
    updatedCell.textContent = formatDate(contract.updatedAt);

    const actionsCell = document.createElement("td");
    actionsCell.className = "contracts-actions-cell";

    const resume = document.createElement("a");
    resume.className = "button-link secondary";
    resume.href = `./offer.html?draftId=${encodeURIComponent(contract.id)}`;
    resume.textContent = "Öffnen";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger-button";
    remove.textContent = "Löschen";
    remove.addEventListener("click", async () => {
      try {
        await deleteDraft(contract.id);
        await loadDrafts();
      } catch (error) {
        authStatus.textContent = `Fehler: ${toGermanErrorMessage(error)}`;
      }
    });

    actionsCell.appendChild(resume);
    actionsCell.appendChild(remove);
    row.appendChild(idCell);
    row.appendChild(ownerCell);
    row.appendChild(updatedCell);
    row.appendChild(actionsCell);
    tbody.appendChild(row);
  }

  return table;
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
    throw new Error(await toGermanApiError(response, "Vertrag konnte nicht gelöscht werden"));
  }
}

function restoreAuthStatus() {
  if (localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)) {
    authStatus.textContent = "Token vorhanden. Verträge können geladen werden.";
    loadDrafts().catch(() => {
      authStatus.textContent = "Token vorhanden, Laden fehlgeschlagen. Bitte neu anmelden.";
    });
  }
}

function normalizeContractStatus(status) {
  return status === "booked" ? "booked" : "draft";
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("de-DE");
}
