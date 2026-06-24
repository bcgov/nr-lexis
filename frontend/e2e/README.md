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

- The scheduled/manual `Regression` workflow reads TEST IDIR credentials from AWS Secrets Manager
  before running Playwright.
- The `test` GitHub environment must define `AWS_SECRETS_MANAGER_ROLE_ARN` as a secret for a
  GitHub OIDC assumable AWS role with `secretsmanager:GetSecretValue` access to the IDIR secret.
- The workflow fetches the `test/mof_famt` secret from AWS Secrets Manager in `ca-central-1`.
- Do not configure IDIR username/password as GitHub secrets. The workflow masks the values returned
  from AWS and passes them into the regression command as `E2E_IDIR_USER`,
  `E2E_IDIR_PASSWORD`, and `E2E_IDIR_EXPECTED_PRINCIPAL`.
- The AWS secret value must be JSON with this shape:

```json
{
  "username": "idir-user",
  "password": "idir-password",
  "OSID (online service id)": "MOF_FAMT"
}
```

- The IDIR suite asserts the authenticated principal includes the secret's online service ID and
  that the account has admin grants.
- Credentialed regression jobs are scoped to the `test` GitHub environment, so dev preview deploys
  stay on smoke coverage.
- CI suppresses Playwright screenshots, video, and traces for the credentialed regression suite
  because those runs type real test credentials.

## Run commands

```bash
npm run e2e
npm run e2e:regression
npm run e2e:ui
npm run e2e:report
```

Override base URL when needed:

```bash
E2E_BASE_URL=http://127.0.0.1:4173 npm run e2e
E2E_BASE_URL=https://nr-lexis-test.apps.silver.devops.gov.bc.ca npm run e2e:regression
```

For local `e2e:regression` runs, export `E2E_IDIR_USER`, `E2E_IDIR_PASSWORD`, and
`E2E_IDIR_EXPECTED_PRINCIPAL` in your shell from approved secure sources. The local command does not
fetch AWS Secrets Manager values.
