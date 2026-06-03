# Playwright E2E Smoke

This suite validates core frontend availability in deployment environments.

## What it covers

- Landing/login shell renders.
- Unauthenticated users cannot directly access protected routes.
- Authenticated route and workflow coverage is handled by unit/integration tests, plus
  environment-backed manual smoke testing with a real IDIR or Business BCeID session.

## Execution model

- Defaults to `E2E_BASE_URL=http://127.0.0.1:4173`.
- If `E2E_BASE_URL` is a deployed URL in CI, Playwright does not start a local `webServer`.
- Only `smoke.spec.ts` runs. Local role simulation is intentionally not supported.

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
