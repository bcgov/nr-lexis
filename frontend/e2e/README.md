# Playwright E2E Smoke

The default suite validates core frontend availability in deployment environments. Credentialed
regression coverage uses a separate TEST-only Playwright config.

## What it covers

- Landing/login shell renders.
- Unauthenticated users cannot directly access protected routes.
- Authenticated route and workflow coverage is handled by unit/integration tests, environment-backed
  manual smoke testing, and TEST credentialed regression configs.

## Execution model

- Defaults to `E2E_BASE_URL=http://127.0.0.1:4173`.
- If `E2E_BASE_URL` is a deployed URL in CI, Playwright does not start a local `webServer`.
- The default config only runs `smoke.spec.ts`. Local role simulation is intentionally not
  supported.
- `playwright.regression.config.ts` runs the scheduled TEST IDIR admin regression specs.

## CI setup

- The scheduled/manual `Regression` workflow reads TEST credentials from GitHub `test` environment
  secrets before running Playwright.
- Required `test` environment secrets:
  - `E2E_IDIR_USER`
  - `E2E_IDIR_PASSWORD`
- The IDIR suite asserts the account establishes an authenticated session and has admin grants.
- The IDIR suite also validates, submits, reviews, and cleans up a fresh TEST application at
  runtime, so static application-number variables are not required for the active regression path.
- The scheduled workflow selects only the IDIR suite with Playwright `--grep` while BCeID is paused.
- TODO: Re-enable the Business BCeID and mixed BCeID/IDIR lifecycle suites once the TEST Business
  BCeID regression account is unlocked and reset. Those skipped suites will require `E2E_BCEID_USER`
  and `E2E_BCEID_PASSWORD` in the GitHub `test` environment.
- Credentialed regression jobs are scoped to the `test` GitHub environment, so dev preview deploys
  stay on smoke coverage.
- CI suppresses Playwright screenshots, video, and traces for the credentialed regression suite
  because those runs type real test credentials.

## Run commands

```bash
npm run e2e
npm run e2e:regression
npm run e2e:regression:idir
npm run e2e:ui
npm run e2e:report
```

Override base URL when needed:

```bash
E2E_BASE_URL=http://127.0.0.1:4173 npm run e2e
E2E_BASE_URL=https://nr-lexis-test.apps.silver.devops.gov.bc.ca npm run e2e:regression
E2E_BASE_URL=https://nr-lexis-test.apps.silver.devops.gov.bc.ca npm run e2e:regression:idir
```

For local `e2e:regression` runs, export the same `E2E_IDIR_*` credential variables in your shell
from approved secure sources.
