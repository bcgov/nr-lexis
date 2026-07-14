# LEXIS Frontend

React frontend for LEXIS.

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.x | UI framework |
| TypeScript | 6.x | Type safety |
| Vite | 8.x | Build tool and dev server |
| Carbon Design System | 1.x (`@carbon/react`) | UI components |
| AWS Amplify | 6.x | Cognito authentication |
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
| `VITE_USER_POOLS_ID` | Cognito user pool id | - |
| `VITE_USER_POOLS_WEB_CLIENT_ID` | Cognito app client id | - |
| `VITE_COGNITO_DOMAIN` | Cognito hosted UI domain, without protocol | - |
| `VITE_REDIRECT_SIGN_IN` | OAuth callback URL | http://localhost:3000/ |
| `VITE_REDIRECT_SIGN_OUT` | BC Gov logoff URL registered in Cognito; use `logoff.cgi?retnow=1&returl=<encoded-app-root>` and do not chain through LoginProxy OIDC logout | - |
| `VITE_COGNITO_SCOPES` | OAuth scopes | openid profile email |
| `VITE_ZONE` | Environment zone used for IDIR provider selection | dev |
| `VITE_LEXIS_PROD_RTM_ONLY` | Restricts frontend routes and navigation to the Average Monthly Values module for LEXIS admins | false |
| `VITE_FAM_MANAGE_URL` | Optional FAM manage app URL override for the admin user access lookup link | Environment-based default |

Additional route and endpoint overrides are listed in `frontend/.env.example`.

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

The scheduled/manual GitHub `Regression` workflow loads TEST IDIR credentials from GitHub `test`
environment secrets before running `npm run e2e:regression`. Local runs require `E2E_IDIR_USER` and
`E2E_IDIR_PASSWORD` to be exported in your shell.

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
│   ├── context/         # Auth context and session capability checks
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

The application uses [Carbon Design System](https://carbondesignsystem.com/) with BC Gov theming:

- `@carbon/react` - React components
- `@carbon/icons-react` - Icon library
- `@bcgov-nr/nr-theme` - BC Gov theme
