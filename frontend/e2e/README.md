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
- The default config only runs files ending in `smoke.spec.ts`.
- `playwright.regression.config.ts` runs files ending in `regression.spec.ts`, including the
  synthetic session-timeout scenario and the TEST credentialed regression specs.

## CI setup

- The scheduled/manual `Regression` workflow reads TEST credentials from GitHub `test` environment
  secrets before running Playwright.
- Required `test` environment secrets:
  - `E2E_IDIR_USER`
  - `E2E_IDIR_PASSWORD`
- The IDIR suite asserts the account establishes an authenticated session, has admin grants, can
  reach representative UI/API contracts, and can validate/submit/review/clean fresh TEST application
  data at runtime.
- The suite submits the EICAR test payload to document and submission uploads and expects a
  rejection. This verifies TEST LEXIS can reach its shared ClamAV service; see
  [Shared ClamAV service](../../docs/shared-clamav-service.md) for the deployment and network
  requirements.
- Business BCeID browser regression is intentionally not scheduled because repeated automated login
  attempts can lock the TEST account. BCeID button and routing behavior stay covered by smoke and
  unit tests.
- Credentialed regression jobs are scoped to the `test` GitHub environment, so dev preview deploys
  stay on smoke coverage.
- CI explicitly masks the credential values and suppresses Playwright HTML reports, screenshots,
  video, and traces for the credentialed regression suite because those runs type real test
  credentials. Credentialed regression artifacts are not uploaded from the public workflow.
- Logout follows the FSPTS chain: Siteminder → Keycloak → Cognito → LEXIS. The app builds the nested
  URL from the three `VITE_LOGOUT_*` values so Cognito runs last, clears its session, and returns to
  the Cognito-registered LEXIS origin in `VITE_REDIRECT_SIGN_OUT`.

## Run commands

```bash
npm run e2e
npm run e2e:session-timeout
npm run e2e:regression
npm run e2e:regression:idir
npm run e2e:ui
npm run e2e:report
```

Override base URL when needed:

```bash
E2E_BASE_URL=http://127.0.0.1:4173 npm run e2e
E2E_BASE_URL=https://nr-lexis-test.apps.gold.devops.gov.bc.ca npm run e2e:regression
E2E_BASE_URL=https://nr-lexis-test.apps.gold.devops.gov.bc.ca npm run e2e:regression:idir
```

For local `e2e:regression` runs, export the same `E2E_IDIR_*` credential variables in your shell
from approved secure sources.
