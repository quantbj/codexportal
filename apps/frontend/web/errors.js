/**
 * Normalizes technical/API error messages to user-friendly German text.
 */
export function toGermanErrorMessage(errorOrMessage) {
  const message = extractMessage(errorOrMessage);
  const normalized = message.trim().toLowerCase();

  const dictionary = new Map([
    ["failed to fetch", "Netzwerkfehler beim Verbindungsaufbau."],
    ["networkerror when attempting to fetch resource.", "Netzwerkfehler beim Verbindungsaufbau."],
    ["fetch failed", "Netzwerkfehler beim Verbindungsaufbau."],
    ["pricing request failed", "Preisberechnung konnte nicht durchgeführt werden."],
    ["quote request failed", "Angebotsanfrage konnte nicht gesendet werden."],
    ["login failed", "Anmeldung fehlgeschlagen."],
    ["invalid credentials", "Ungültiger Benutzername oder Passwort."],
    ["missing bearer token", "Anmeldung erforderlich."],
    ["invalid token", "Ungültige Anmeldung. Bitte erneut anmelden."],
    ["session expired", "Sitzung abgelaufen. Bitte erneut anmelden."],
    ["unknown user", "Benutzerkonto nicht gefunden."],
    ["forbidden", "Keine Berechtigung für diese Aktion."],
    ["user not found", "Benutzer nicht gefunden."],
    ["username already exists", "Benutzername ist bereits vergeben."],
    ["username must have at least 3 characters", "Benutzername muss mindestens 3 Zeichen lang sein."],
    ["password must have at least 4 characters", "Passwort muss mindestens 4 Zeichen lang sein."],
    ["invalid role", "Ungültige Rolle."],
    ["admin cannot delete own account", "Admin-Konto kann nicht über diese Aktion gelöscht werden."],
    ["admin cannot reset own password here", "Admin-Passwort kann hier nicht zurückgesetzt werden."],
    ["draft not found", "Entwurf nicht gefunden."],
    ["not found", "Ressource nicht gefunden."],
    ["request body is required", "Eingabedaten fehlen."],
    ["payload too large", "Die Anfrage ist zu groß."],
    ["invalid json payload", "Ungültige Eingabedaten."],
    ["too many authentication attempts. please retry later.", "Zu viele Anmeldeversuche. Bitte später erneut versuchen."],
    ["anfragen konnten nicht geladen werden", "Anfragen konnten nicht geladen werden."],
    ["entwurf konnte nicht gespeichert werden", "Entwurf konnte nicht gespeichert werden."],
    ["anfrage konnte nicht gelöscht werden", "Anfrage konnte nicht gelöscht werden."]
  ]);

  if (dictionary.has(normalized)) {
    return dictionary.get(normalized);
  }

  if (normalized.startsWith("pricing service request failed")) {
    return "Preisberechnungsdienst konnte nicht erreicht werden.";
  }

  if (normalized.startsWith("schema konnte nicht geladen werden")) {
    return message;
  }

  return message || "Unbekannter Fehler.";
}

/**
 * Parses API error payloads safely and returns a localized message.
 */
export async function toGermanApiError(response, fallbackMessage) {
  try {
    const payload = await response.json();
    return toGermanErrorMessage(payload?.error || fallbackMessage);
  } catch {
    return toGermanErrorMessage(fallbackMessage);
  }
}

function extractMessage(errorOrMessage) {
  if (!errorOrMessage) {
    return "";
  }

  if (typeof errorOrMessage === "string") {
    return errorOrMessage;
  }

  if (typeof errorOrMessage.message === "string") {
    return errorOrMessage.message;
  }

  return String(errorOrMessage);
}
