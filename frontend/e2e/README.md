# Playwright E2E Smoke

This suite validates core frontend availability after migration work.

## What it covers

- Landing/login shell renders.
- Auth transition compatibility:
  - `LEXIS_ADMIN` and legacy `ADMIN` map to the same protected access.
  - Root redirect parity to `/provincial/summary`.
- Provincial review action controls:
  - Selection-driven enablement for approve/update buttons.
  - Status-dependent enablement for "Update Status and Send Email".
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
- Tests bootstrap `LEXIS_ADMIN` into local storage so protected routes are reachable without external auth.

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
