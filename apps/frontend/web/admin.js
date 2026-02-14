import { toGermanApiError, toGermanErrorMessage } from "./errors.js";
import { syncAdminNavVisibility } from "./auth-nav.js";

const AUTH_TOKEN_STORAGE_KEY = "salesPortal.authToken";
const CONTRACTS_SERVICE_BASE_URL = "https://codexportal-contracts.onrender.com";

const adminStatus = document.getElementById("adminStatus");
const adminUsersList = document.getElementById("adminUsersList");
const createUserForm = document.getElementById("createUserForm");
const refreshUsersButton = document.getElementById("refreshUsersButton");
const logoutButton = document.getElementById("logoutButton");

await bootstrap();

createUserForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const response = await fetch(`${CONTRACTS_SERVICE_BASE_URL}/admin/users`, {
      method: "POST",
      headers: withAuthHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        username: createUserForm.username.value.trim(),
        password: createUserForm.password.value,
        role: createUserForm.role.value
      })
    });

    if (!response.ok) {
      throw new Error(await toGermanApiError(response, "Benutzer konnte nicht angelegt werden"));
    }

    createUserForm.reset();
    adminStatus.textContent = "Benutzer angelegt.";
    await loadUsers();
  } catch (error) {
    adminStatus.textContent = `Fehler: ${toGermanErrorMessage(error)}`;
  }
});

refreshUsersButton.addEventListener("click", async () => {
  try {
    await loadUsers();
  } catch (error) {
    adminStatus.textContent = `Fehler: ${toGermanErrorMessage(error)}`;
  }
});

logoutButton.addEventListener("click", async () => {
  await logoutFromContractsService();
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  window.location.href = "./offer.html";
});

async function bootstrap() {
  await syncAdminNavVisibility();
  const token = getAuthToken();
  if (!token) {
    adminStatus.textContent = "Bitte als Admin anmelden.";
    redirectToOffer();
    return;
  }

  const meResponse = await fetch(`${CONTRACTS_SERVICE_BASE_URL}/auth/me`, {
    headers: withAuthHeaders()
  });
  if (!meResponse.ok) {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    adminStatus.textContent = "Anmeldung ungültig. Bitte neu anmelden.";
    redirectToOffer();
    return;
  }

  const me = await meResponse.json();
  // Hard guard: only superusers may stay on this page even via direct URL.
  if (me.role !== "superuser") {
    adminStatus.textContent = "Keine Berechtigung für die Admin-Seite.";
    redirectToOffer();
    return;
  }

  adminStatus.textContent = `Angemeldet als ${me.username} (superuser).`;
  await loadUsers();
}

async function loadUsers() {
  const response = await fetch(`${CONTRACTS_SERVICE_BASE_URL}/admin/users`, {
    headers: withAuthHeaders()
  });

  if (!response.ok) {
    throw new Error(await toGermanApiError(response, "Benutzer konnten nicht geladen werden"));
  }

  const payload = await response.json();
  renderUsers(payload.users || []);
}

function renderUsers(users) {
  adminUsersList.innerHTML = "";
  if (!Array.isArray(users) || users.length === 0) {
    adminUsersList.textContent = "Keine Benutzer vorhanden.";
    return;
  }

  for (const user of users) {
    const item = document.createElement("div");
    item.className = "draft-item";

    const label = document.createElement("div");
    label.textContent = `${user.username} | Rolle: ${user.role}`;

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.textContent = "Passwort zurücksetzen";
    resetButton.addEventListener("click", async () => {
      // Keep reset action explicit to avoid accidental password changes.
      const nextPassword = window.prompt(`Neues Passwort für ${user.username}:`, "");
      if (!nextPassword) {
        return;
      }

      try {
        const response = await fetch(`${CONTRACTS_SERVICE_BASE_URL}/admin/users/${encodeURIComponent(user.id)}/reset-password`, {
          method: "POST",
          headers: withAuthHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ password: nextPassword })
        });
        if (!response.ok) {
          throw new Error(await toGermanApiError(response, "Passwort konnte nicht zurückgesetzt werden"));
        }
        adminStatus.textContent = `Passwort für ${user.username} zurückgesetzt.`;
      } catch (error) {
        adminStatus.textContent = `Fehler: ${toGermanErrorMessage(error)}`;
      }
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger-button";
    deleteButton.textContent = "Entfernen";
    deleteButton.addEventListener("click", async () => {
      if (!window.confirm(`Benutzer ${user.username} wirklich entfernen?`)) {
        return;
      }

      try {
        const response = await fetch(`${CONTRACTS_SERVICE_BASE_URL}/admin/users/${encodeURIComponent(user.id)}`, {
          method: "DELETE",
          headers: withAuthHeaders()
        });
        if (!response.ok) {
          throw new Error(await toGermanApiError(response, "Benutzer konnte nicht entfernt werden"));
        }
        adminStatus.textContent = `Benutzer ${user.username} entfernt.`;
        await loadUsers();
      } catch (error) {
        adminStatus.textContent = `Fehler: ${toGermanErrorMessage(error)}`;
      }
    });

    const actions = document.createElement("div");
    actions.className = "draft-actions";
    actions.appendChild(resetButton);
    actions.appendChild(deleteButton);

    item.appendChild(label);
    item.appendChild(actions);
    adminUsersList.appendChild(item);
  }
}

function withAuthHeaders(extra = {}) {
  return {
    ...extra,
    authorization: `Bearer ${getAuthToken()}`
  };
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

function redirectToOffer() {
  setTimeout(() => {
    window.location.href = "./offer.html";
  }, 1200);
}
