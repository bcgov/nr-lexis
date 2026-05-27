# Playwright E2E Smoke

This suite validates core frontend availability after migration work.

## What it covers

- Landing/login shell renders.
- Auth transition compatibility:
  - Canonical `ADMIN` and legacy alias `LEXIS_ADMIN` map to the same protected access.
  - Legacy placeholder roles (`LEXIS_INDUSTRY*`, `LOG_EXPORT_INDUSTRY*`) remain routable during transition.
  - Root redirect parity to `/provincial/summary`.
- Provincial application action controls:
  - "Create Exemption for Selected Applications" stays disabled until selection.
  - Selected-row client validation blocks invalid multi-select creates.
  - Valid selection navigates to exemption create with prefilled state.
- Provincial review action controls:
  - Selection-driven enablement for approve/update buttons.
  - Status-dependent enablement for "Update Status and Send Email".
- Provincial exemption action controls:
  - Approve action stays disabled until at least one eligible row is selected.
  - Row eligibility respects approval rules (`NEW`, approvable, not locked).
  - Approval click shows readiness status for selected rows.
- Federal application action controls:
  - Create-exemption action stays disabled until at least one eligible row is selected.
  - Row eligibility respects federal checkbox availability (legacy `showCheckbox` behavior).
  - Multi-selection validates client-number matching before navigation.
- Core protected routes render:
  - `/provincial/application`
  - `/provincial/exemption`
  - `/provincial/offers`
  - `/provincial/permit`
  - `/provincial/review`
  - `/federal`
  - `/indian-reserve`
- URL-backed filter state updates for key table inputs.

## Execution model

- Defaults to `E2E_BASE_URL=http://127.0.0.1:4173`.
- Playwright launches the Vite dev server automatically via `webServer` in config.
- Tests bootstrap `ADMIN` into local storage so protected routes are reachable without external auth.

## Run commands

```bash
npm run e2e
npm run e2e:ui
npm run e2e:report
```

Override base URL when needed:

```bash
E2E_BASE_URL=http://localhost:4173 npm run e2e
```
