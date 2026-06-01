# LEXIS Frontend

React frontend for LEXIS.

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.x | UI framework |
| TypeScript | 6.x | Type safety |
| Vite | 8.x | Dev server and build |
| Carbon Design System | 1.x (`@carbon/react`) | UI components |
| React Router | 7.x | Routing |
| Vitest + Playwright | 4.x / 1.x | Unit and E2E testing |

## Local Run

See [../README.md](../README.md#local-development).

## Environment Variables

Configured through `frontend/.env` (copy from `.env.example`).

| Variable | Description |
|----------|-------------|
| `VITE_USER_POOLS_ID` | Cognito user pool id |
| `VITE_USER_POOLS_WEB_CLIENT_ID` | Cognito app client id |
| `VITE_COGNITO_DOMAIN` | Cognito hosted UI domain (no protocol) |
| `VITE_REDIRECT_SIGN_IN` | OAuth callback URL (LEXIS `/dashboard`) |
| `VITE_REDIRECT_SIGN_OUT` | OAuth sign-out redirect URL |
| `VITE_COGNITO_SCOPES` | OAuth scopes (default `openid profile email`) |
| `VITE_ZONE` | Environment zone used for IDIR provider selection (e.g. `dev`) |
| `VITE_LEXIS_REPORT_API_BASE` | Report API base path |
| `VITE_LEXIS_REPORT_INCLUDE_ACTION_MAPPING` | Include legacy action mapping when requesting reports |
| `VITE_LEXIS_CREATE_SUBMIT_REQUEST_MODE` | Create-submit payload mode (`form` or `json`) |
| `VITE_LEXIS_CREATE_SUBMIT_INCLUDE_ACTION_MAPPING` | Include legacy action mapping for create-submit |
| `VITE_LEXIS_CREATE_APPLICATION_ENDPOINT` | Create application endpoint |
| `VITE_LEXIS_CREATE_EXEMPTION_ENDPOINT` | Create exemption endpoint |
| `VITE_LEXIS_CREATE_OFFER_ENDPOINT` | Create offer endpoint |
| `VITE_LEXIS_CREATE_PERMIT_ENDPOINT` | Create permit endpoint |
| `VITE_LEXIS_CREATE_INDIGENOUS_PERMIT_ENDPOINT` | Create indigenous permit endpoint |

## Common Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build production assets |
| `npm run lint` | Run ESLint |
| `npm run format:check` | Check Prettier formatting |
| `npm run test:unit` | Run unit tests |
| `npm run test:cov` | Run tests with coverage |
| `npm run e2e` | Run Playwright E2E (chromium) |

## Testing

```bash
npm run test:unit
npm run test:cov
npm run e2e
```
