# Playwright E2E Smoke

This suite validates core frontend availability in deployment environments.

## What it covers

- Landing/login shell renders.
- Unauthenticated users cannot directly access protected routes.

## Execution model

- Defaults to `E2E_BASE_URL=http://127.0.0.1:4173`.
- If `E2E_BASE_URL` is a deployed URL in CI, Playwright does not start a local `webServer`.
- By default, only `smoke.spec.ts` runs.
- To run the older simulation-based route suites locally, set:
  - `E2E_ENABLE_SIMULATION_SPECS=true`

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
