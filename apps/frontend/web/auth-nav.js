const AUTH_TOKEN_STORAGE_KEY = "salesPortal.authToken";
const CONTRACTS_SERVICE_BASE_URL = "https://codexportal-contracts.onrender.com";

/**
 * Shows the admin navigation link only for authenticated superusers.
 */
export async function syncAdminNavVisibility() {
  const adminLinks = document.querySelectorAll(".admin-nav-link");
  adminLinks.forEach((link) => link.classList.add("nav-hidden"));

  const token = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  if (!token) {
    return;
  }

  try {
    const response = await fetch(`${CONTRACTS_SERVICE_BASE_URL}/auth/me`, {
      headers: { authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      return;
    }

    const user = await response.json();
    if (user.role !== "superuser") {
      return;
    }

    adminLinks.forEach((link) => link.classList.remove("nav-hidden"));
  } catch {
    // Keep admin link hidden when user lookup fails.
  }
}
