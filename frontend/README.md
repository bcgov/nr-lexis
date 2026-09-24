# LEXIS Frontend

React frontend for LEXIS.

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.x | UI framework |
| TypeScript | 6.x | Type safety |
| Vite | 8.x | Build tool and dev server |
| Carbon Design System | 1.x (`@carbon/react`) | UI components |
| oidc-client-ts | 3.x | BC Gov SSO authorization code + PKCE |
| React Router | 7.x | Routing |
| Vitest + Playwright | 4.x / 1.x | Unit and E2E testing |

## Running Locally

See the [root README's Local Development section](../README.md#local-development). Both `npm run dev` and Docker Compose workflows live there, along with `.env` setup.

## Configuration

### Environment Variables

Mirrors `frontend/.env.example`. Local Vite reads these values at dev/build time. The deployed
container writes them to runtime configuration during startup, so an environment change requires a
rollout but not an image rebuild.

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_OIDC_ISSUER_URI` | BC Gov SSO realm issuer for interactive users | - |
| `VITE_OIDC_CLIENT_ID` | LEXIS public browser client ID | - |
| `VITE_OIDC_IDIR_HINT` | Registered IDIR provider alias | azureidir |
| `VITE_OIDC_BCEID_HINT` | Registered Business BCeID provider alias | bceidbusiness |
| `VITE_OIDC_SITEMINDER_LOGOUT_URL` | SiteMinder `logoff.cgi` chained before Keycloak end-session | - (Keycloak only) |
| `VITE_LEXIS_PROD_RTM_ONLY` | Restricts admins to Average Monthly Values, preserves normal read-only routes, and denies other application roles | false |

Register `<origin>/authCallback` as the login callback and `<origin>` as the post-logout URL. Tokens live in sessionStorage; there is no browser client secret.

Additional route and endpoint overrides are listed in `frontend/.env.example`.

### Report Downloads

Browsers that support the File System Access API stream generated reports directly to the selected
file. Other browsers retain the existing Blob download fallback for compatibility.

### Development Server Options

These are read by `vite.config.ts` and only matter when running `npm run dev` or the Compose frontend service.

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_DEV_HOST` | Dev server bind address (`0.0.0.0` in Docker) | localhost |
| `VITE_DEV_PORT` | Dev server port | 3000 |
| `VITE_DEV_BACKEND_TARGET` | Where Vite's `/api` proxy forwards | http://localhost:8080 |
| `VITE_HMR_HOST` | HMR WebSocket host the browser dials | localhost |
| `VITE_HMR_PORT` | HMR WebSocket port | 3000 |
| `VITE_HMR_PROTOCOL` | `ws` or `wss` | ws |

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run clean` | Remove Vite cache |
| `npm run build` | Build production assets |
| `npm run build:clean` | Remove `dist/` |
| `npm run build:analyze` | Build with Vite analyze mode |
| `npm run deploy` | CI build command: install production deps and build |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with auto-fix |
| `npm run format:check` | Check Prettier formatting |
| `npm run test:unit` | Run unit tests |
| `npm run test:cov` | Run tests with coverage |
| `npm run e2e` | Run Playwright smoke E2E in Chromium |
| `npm run e2e:regression` | Run TEST credentialed regression E2E |
| `npm run e2e:ui` | Run Playwright UI mode |
| `npm run e2e:report` | Open the last Playwright HTML report |

## Testing

```bash
npm run test:unit
npm run test:cov
npm run e2e
```

The GitHub `Regression` workflow is manual-only while the FAM team fixes the TEST IDIR regression
account for Keycloak. It loads credentials from GitHub `test` environment secrets and runs Playwright
with the safe regression reporter. Local runs require `E2E_IDIR_USER` and `E2E_IDIR_PASSWORD` to be
exported in your shell. See [the restoration steps](e2e/README.md#ci-setup) before resuming weekly runs.

### Testing Libraries

| Library | Purpose |
|---------|---------|
| Vitest | Test runner |
| Testing Library | Component testing |
| Playwright | Browser smoke testing |

## Project Structure

```text
frontend/
├── e2e/                 # Playwright E2E tests
├── public/              # Static public files and runtime config seed
├── src/
│   ├── components/      # Reusable UI components
│   ├── config/          # App and test configuration
│   ├── context/         # Auth context, session capability and regional access checks
│   ├── interfaces/      # Shared TypeScript contracts
│   ├── pages/           # Route-level page components
│   ├── routes/          # Route table and guards
│   ├── scss/            # Global styles
│   └── service/         # API service modules
├── package.json
├── playwright.config.ts
└── vite.config.ts
```

## UI Components

The application uses [Carbon Design System](https://carbondesignsystem.com/) components:

- `@carbon/react` - React components
- `@carbon/icons-react` - Icon library
