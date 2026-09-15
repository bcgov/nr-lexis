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
- Each failed test gets one retry in CI; local runs do not retry. Basic E2E uses one job, with no
  separate retry job, and fails on a failed readiness check or a test that still fails after its
  retry. Failed smoke attempts retain their report and trace for diagnosis.
- `playwright.regression.config.ts` runs files ending in `regression.spec.ts`, including the
  synthetic session-timeout, automatic/manual logout warning scenarios, and the TEST credentialed
  regression specs.

## CI setup

- The scheduled/manual `Regression` workflow runs on the default branch and reads TEST credentials
  from GitHub `test` environment secrets before running Playwright. Pushing a feature branch does
  not run this credentialed gate against that branch.
- Required `test` environment secrets:
  - `E2E_IDIR_USER`
  - `E2E_IDIR_PASSWORD`
- No fixture identifiers need configuring. Each lifecycle run creates unique applications, packages,
  scales, offers, exemptions and permits through the normal APIs. Cleanup runs after success or
  failure: it removes packages/scales and terminalizes records retained by the business APIs.
  Existing records are never mutation targets.
- CLIENT/FTA master records are external reference data; LEXIS has lookup and validation APIs but
  cannot create clients, locations or timber authorities. The lifecycle reads reference keys from up
  to 25 recent packaged provincial applications and checks up to 25 distinct combinations with the
  read-only submission validator. Names, contacts and quantities in the new records are synthetic.
  Only explicit unavailable-reference errors permit trying another candidate; other validation or
  API failures fail immediately. Reference values stay in memory and out of public output.
- An environment with no usable external references cannot run this lifecycle until its CLIENT/FTA
  data is provisioned. This fails the lifecycle check without blocking unrelated IDIR checks.
  Current list-date schedules and shipping code tables are also read at runtime. A fully empty
  environment needs those external/reference services seeded by their owners; the regression account
  does not gain database or external-registry write access.
- The IDIR suite asserts the account establishes an authenticated session, has admin grants, can
  reach representative UI/API contracts, and can validate/submit/review/clean fresh TEST application
  data at runtime.
- The provincial lifecycle queues application-status, exemption-approval, and permit-approval emails
  to TEST's configured override recipients using generic regression content. Offer creation and the
  required cleanup withdrawal exercise the automatic offer-email paths; the intermediate offer edit
  is intentionally non-notifying. These checks prove the application handed each message to the TEST
  mail sender, not that a mailbox received it.
- The suite submits the EICAR test payload to document and submission uploads and expects a
  rejection. This verifies TEST LEXIS can reach its shared ClamAV service; see
  [Shared ClamAV service](../../docs/shared-clamav-service.md) for the deployment and network
  requirements.
- Business BCeID browser regression is intentionally not scheduled because repeated automated login
  attempts can lock the TEST account. BCeID button and routing behavior stay covered by smoke and
  unit tests; the BCeID-only permit review-request email remains outside the scheduled suite.
- Credentialed regression jobs are scoped to the `test` GitHub environment, so dev preview deploys
  stay on smoke coverage.
- Credentialed page loads and the session-timeout setup recover from connection failures, frontend
  502/503/504 responses, and interrupted or empty app shells for at most 150 seconds. Pending
  startup GETs, including session capabilities, also permit recovery after a render timeout.
  Individual document attempts take at most 10 seconds, with 5/10/20-second backoff; rendering
  retains its 30-second limit per attempt. Recovery logs contain only timing and failure categories.
- These suites allow four minutes per test so recovery can finish. IDIR login runs inside each test
  using the shared browser session, rather than in `beforeAll`, so one login failure does not
  prevent the remaining tests from executing. Credentialed test bodies still have zero retries:
  saves and cleanup are never replayed by navigation recovery. Wrong headings on rendered pages,
  denied/missing resources, and unrelated JavaScript errors remain failures.
- IDIR button actionability and federated-navigation completion have separate waits. Authenticated
  API GETs retain bounded transport retries. POST/PUT/DELETE retry only an explicit connection
  refusal before sending, with redirect following and implicit retries disabled. They do not retry
  ambiguous resets, timeouts, or HTTP responses; the existing single auth-refresh retry remains
  unchanged.
- Both the regression config and workflow use `safe-regression-reporter.ts`. Public output contains
  static test names, counts, failure categories, source locations, and fixed recovery messages. Raw
  exceptions, headers, assertion values, page contents, attachments, and arbitrary test
  stdout/stderr are suppressed. Keep test names free of business data. Do not override this reporter
  for credentialed public runs or enable debug output.
- Credentials are supplied only to the validation/test steps as GitHub secrets. Traces, screenshots,
  videos, HTML reports, and artifact uploads remain disabled for credentialed runs. Detailed
  debugging belongs in a controlled synthetic reproduction or an approved private channel. See
  [GitHub's secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use).
- The Chromium job retains `continue-on-error` so the separate **TEST Regression Result** job can
  report the outcome outside the deployment environment. A green Chromium job alone is not a pass.
- Logout follows the FSPTS chain: Siteminder → Keycloak → Cognito → LEXIS. The app builds the nested
  URL from the three `VITE_LOGOUT_*` values so Cognito runs last, clears its session, and returns to
  the Cognito-registered LEXIS origin in `VITE_REDIRECT_SIGN_OUT`.

## Run commands

Basic E2E uses the same 150-second bounded recovery for synthetic page navigation and runtime-config
GETs, within a four-minute test limit. Config reads retry transport failures and HTTP 502/503/504;
other HTTP errors fail immediately. Successful runtime configuration stays cached for the worker.
These helpers do not replay test bodies or API writes. Resource failures are scoped to the
navigation attempt that started the request, so late cancellations or responses from a timed-out
attempt cannot fail the next attempt.

Synthetic navigation requires a `ready` locator for the expected page content (or the loading
indicator when testing loading states), so interrupted scripts can recover before assertions begin.
The mocked parity regression specs also use the four-minute test limit.

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

For local `e2e:regression` runs, export the same `E2E_IDIR_*` credentials in your shell from
approved secure sources. No `E2E_REGRESSION_*` fixture settings are used.

The transport recovery checks intercept every page request and need no credentials or running app.
They cover a refused document, an interrupted configuration script, an interrupted lazy page module,
pending bootstrap requests, delayed federation, safe redirect handling, and application failures
that must not be retried:

```bash
CI=1 E2E_BASE_URL=https://navigation.example.test npx playwright test --config=playwright.regression.config.ts e2e/navigation-recovery-regression.spec.ts --project=chromium
```

Reporter privacy checks use synthetic secrets and business values. Run them with
`npm run test:unit -- --run src/utils/__tests__/safe-regression-reporter.test.ts`. From `backend`,
`mvn -Dtest=RegressionWorkflowDefaultsTest test` checks the workflow constraints. These local checks
do not replace fresh credentialed CI against the intended TEST deployment.
