# Playwright E2E Smoke

The default suite validates core frontend availability in deployment environments. Real-role
regression coverage uses a separate TEST-only Playwright config.

## What it covers

- Landing/login shell renders.
- Unauthenticated users cannot directly access protected routes.
- Authenticated route and workflow coverage is handled by unit/integration tests, environment-backed
  manual smoke testing, and the TEST Business BCeID regression config.

## Execution model

- Defaults to `E2E_BASE_URL=http://127.0.0.1:4173`.
- If `E2E_BASE_URL` is a deployed URL in CI, Playwright does not start a local `webServer`.
- The default config only runs `smoke.spec.ts`. Local role simulation is intentionally not
  supported.
- `playwright.real-bceid.config.ts` runs the TEST Business BCeID provincial submitter regression
  specs.

## CI setup

- `E2E_BCEID_USER` and `E2E_BCEID_PASSWORD` must be set as `test` environment secrets.
- `E2E_PROVINCIAL_APPLICATION_NUMBER` and `E2E_PROVINCIAL_UNOWNED_APPLICATION_NUMBER` can be set as
  `test` environment variables to enable owned/unowned application detail checks.
- Real-auth jobs are scoped to the `test` GitHub environment, so dev preview deploys stay on smoke
  coverage.
- CI suppresses Playwright screenshots, video, and traces for real-auth suites because those runs
  type real test credentials.

## Run commands

```bash
npm run e2e
npm run e2e:real-bceid
npm run e2e:ui
npm run e2e:report
```

Override base URL when needed:

```bash
E2E_BASE_URL=http://127.0.0.1:4173 npm run e2e
E2E_BASE_URL=https://nr-lexis-test.apps.silver.devops.gov.bc.ca npm run e2e:real-bceid
```
