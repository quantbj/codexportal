# Sales Portal User Manual

## 1. Purpose and Scope

This manual explains how to use the Sales Portal end-to-end:

- Pricing calculation workflow
- Contract booking workflow
- Draft and booked contract management
- Account login/signup/logout
- Admin user management (superuser only)
- Common issues and FAQ

The portal UI is primarily in German (for example `Vertrag buchen`, `Gebuchte Verträge`), while this manual is in English for broader team use.

## 2. Prerequisites

- A supported browser (current Chrome, Edge, Firefox, Safari)
- Portal URL (for local development usually `http://localhost:3000`)
- Valid user credentials
- For admin features: a `superuser` account

## 3. Navigation Overview

Top navigation links:

- `Pricing` (`index.html`): price-relevant contract parameters and revenue calculation
- `Vertrag buchen` (`offer.html`): non-pricing contract parameters, draft save, booking
- `Gebuchte Verträge` (`my-requests.html`): view/manage saved entries in `Draft` and `Booked`
- `Admin` (`admin.html`): user management (visible to superusers only)
- `AGB`, `Impressum`: legal information

## 4. Authentication and Roles

### 4.1 Login

Login is available on:

- `Pricing`
- `Vertrag buchen`
- `Gebuchte Verträge`

On successful login, your bearer token is stored in browser local storage.

### 4.2 Signup (self-service)

On `Vertrag buchen`, users can create a new account using:

- `Neuer Benutzername`
- `Neues Passwort`

After signup, the portal logs the user in automatically.

### 4.3 Logout

Logout:

- Clears local auth token
- Calls server logout endpoint
- Revokes current session server-side

### 4.4 Roles

- `customer`: can access only own contracts/drafts
- `superuser`: can access all contracts/drafts and admin tools

## 5. Pricing Page (`Pricing`)

### 5.1 What this page does

- Loads and renders fields from `contract-pricing.json`
- Lets authenticated users enter price-relevant technical parameters
- Sends calculation request to backend
- Shows annual net revenue result

### 5.2 Typical workflow

1. Log in.
2. Fill contract-pricing fields.
3. Click `Preis berechnen`.
4. Review result in `Nettoerlös/Jahr`.
5. Continue to `Vertrag buchen`.

### 5.3 Data persistence behavior

- Pricing parameters are saved to local storage after successful calculation.
- The Offer page reuses these pricing values.

## 6. Offer Page (`Vertrag buchen`)

### 6.1 What this page does

- Loads fields from `contract-offer.json`
- Combines offer data with pricing data from local storage
- Supports draft save and booking
- Allows loading existing draft by ID (`draftId` URL parameter)

### 6.2 Buttons and outcomes

- `Entwurf speichern`:
  - Persists contract with status `draft`
  - Keeps it editable
- `Vertrag buchen`:
  - Sends quote request to backend
  - Persists contract with status `booked`
  - Updates existing active draft if one is loaded

### 6.3 Sidebar draft list

After login and load:

- Shows saved entries
- Displays owner and status (`Draft`/`Booked`)
- `Weiter bearbeiten` opens selected record on the offer page

## 7. Contracts Page (`Gebuchte Verträge`)

### 7.1 Page purpose

Central place to view and manage saved records, split into:

- `Draft`
- `Booked`

### 7.2 Table columns

Each table row includes:

- `Vertrags-ID` (contract id if present, otherwise quote id / fallback)
- `Firma` (company name from contract/customer payload)
- `Datensatz-ID` (internal persisted record id)
- `Besitzer`
- `Update` (last updated timestamp)
- `Aktion` (`Öffnen`, `Löschen`)

### 7.3 Clickable rows + preview popup

- Clicking a row opens a preview modal.
- Modal shows:
  - Metadata (`Vertrags-ID`, `Firma`)
  - Full saved payload as formatted JSON
- Close methods:
  - `Schließen` button
  - Click outside modal
  - `Esc` key

### 7.4 Row action behavior

- `Öffnen`: opens the record on `Vertrag buchen` for editing
- `Löschen`: deletes the record
- Action clicks do not trigger row preview popup accidentally

## 8. Admin Page (`Admin`) - Superuser Only

### 8.1 Access rules

- Non-authenticated users are redirected to `Vertrag buchen`
- Authenticated non-superusers are denied and redirected
- Only `superuser` remains on page

### 8.2 Available functions

- List users
- Create user (`customer` or `superuser`)
- Reset password
- Delete user

### 8.3 Safety checks

- Reset password requires explicit prompt input
- Delete requires confirmation dialog

## 9. Data and Status Model

Saved contract records include status:

- `draft`: saved from `Entwurf speichern`
- `booked`: saved from `Vertrag buchen`

Legacy records without explicit status are treated as `draft` in UI.

Persistence options:

- MongoDB (recommended)
- File fallback (`apps/contracts-service/data/drafts.json`)

## 10. Error Messages and Recovery

Common displayed errors include:

- Login failure
- Missing token / session invalid
- Failed contract load/save/delete
- Invalid or incomplete form-derived contract data

Recommended recovery sequence:

1. Re-login
2. Reload contracts
3. Re-open target draft
4. If still failing, check backend/contracts-service health (`/health`, `/ready`)

## 11. Best-Practice Usage Flow

1. Log in on `Pricing`.
2. Fill and calculate price parameters.
3. Move to `Vertrag buchen`.
4. Fill offer parameters.
5. Use `Entwurf speichern` during intermediate editing.
6. Use `Vertrag buchen` when ready.
7. Verify in `Gebuchte Verträge` under `Booked`.
8. Use row preview to verify full payload before downstream processing.

## 12. FAQ

### Q1: What is the difference between `Draft` and `Booked`?

`Draft` is created by `Entwurf speichern` and is intended for ongoing editing.  
`Booked` is created by `Vertrag buchen` and indicates a booked/submitted contract workflow state.

### Q2: I clicked `Vertrag buchen` but cannot find it in `Booked`.

Check:

- You are logged in as the same user
- Save/booking request did not fail (look for error message)
- Click `Verträge laden` on `Gebuchte Verträge`

### Q3: Why do I need to login before editing forms?

The application gates editing and persistence actions by authentication so records are associated with a user and protected by role-based access.

### Q4: Can I continue a previous contract later?

Yes. Open `Gebuchte Verträge`, click `Öffnen` for the record, then continue on `Vertrag buchen`.

### Q5: What does `Datensatz-ID` mean?

It is the internal storage record identifier used by the contracts service. It is useful for traceability and troubleshooting.

### Q6: Why are some rows missing company name or contract id?

Older or partially completed payloads may not include those fields yet. The UI shows fallbacks where possible.

### Q7: Does deleting a row remove it for everyone?

- `customer`: can delete own records only
- `superuser`: can delete any record

### Q8: I cannot see the `Admin` tab. Is this a bug?

Usually no. The tab is only shown for authenticated `superuser` sessions.

### Q9: What closes the contract preview popup?

- `Schließen`
- clicking outside popup
- pressing `Esc`

### Q10: Are form values saved automatically while typing?

Not as persisted server records. Use explicit actions (`Entwurf speichern` or `Vertrag buchen`). Pricing parameters are cached in local storage after successful pricing calculation.

### Q11: Can I use the portal without MongoDB?

Yes. Contracts service supports file-based fallback storage in local/dev mode.

### Q12: Who should I contact if something is wrong with user roles?

A superuser/admin should review user role assignments via `Admin` page and correct account configuration.
