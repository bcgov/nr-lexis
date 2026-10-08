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
- `@carbon/pictograms-react` - Pictograms for empty states

Use Carbon icons and pictograms for all UI glyphs. Don't hand-draw SVG or CSS icons.

Mark required fields with `requiredLabel()`. Its stylesheet draws a plain red `*` before the label, hidden from screen readers, so the input must also set `required` or `aria-required` (a unit test checks every call site).

Show read-only values with `displayValue()`. A blank value renders `—`, announced as "Not provided". Where a string is needed (template literals, `aria-label`, input values), use `displayValueText()`; a unit test rejects `displayValue()` in string contexts.

Show volumes with `displayVolume()` or `formatVolume()` from `@/utils/volume`: one decimal, or two when the stored value has them (`0.0`, `1,234.5`, `12.25`). Fill volume inputs with `formatVolumeInput()`, which drops the thousands separator.

Format volume values when loading an editor, including its saved snapshot, rather than on every
keystroke. Application volume accepts two decimal places. OIC request-volume editors retain their
existing text representation because the storage field is `VARCHAR2(9)`; format only their read-only
display.

Label owner client fields Client and Client location. Agent fields are Agent client and Agent
client location on permits, and Agent client and Agent location on applications. Client location
selects open on "Select location". Read-only Client values combine the company name and client
number, with the acronym where available; do not repeat the company name in a separate row.

Shipping reference labels lowercase the connector "Of" to "of" for display. Option codes and the
returned reference names remain unchanged.

Set `size="md"` (40px) on every `Button`; Carbon's default is lg (48px). A unit test checks every
call site.

Put actions that cover the whole record (Save and Cancel on a create page, Approve exemption, Print
permit) in `PageHeader`'s `actions`, on the title row above any notification. A tab's edit actions
(Cancel, Save changes) go inside its card, bottom right, after the last field.

Title each record card with `DetailCardTitle`, passing its tab's icon: an h2 in heading-03 led by
the 24px icon. A titled section inside a card is an h3 with `detail-section-subtitle`
(heading-compact-02, no icon).

Use `pages/shared/RecordFieldGrid` for record fields, keeping the same `RecordFieldRow` groups and
field spans in view and edit. A standard field fills one of four columns on large screens, two on
medium screens and one on small screens. Use `span="wide"` for Region and the wider client, address
and shipping fields; use `span="full"` for remarks and conditions. Leave unused columns empty.
`RecordField` renders its value or its `edit` control; `RecordFieldCell` holds other controls.
Render tables as full-width siblings of field grids so their tooltips and popovers stay outside
field rows. Keep field IDs and names stable when changing the layout.

An empty tab has no card. Render `EmptyState` with `variant="tab"` straight in the tab panel, with
the tab's pictogram: Cardboard for Scale, AddDocument for Documents, Invoice for Fees. An empty
section inside a card is one line of text.

### Forms

- **Save:** Save buttons stay enabled and are disabled only while saving. On Save, validate and show each error on its field (`invalid` and `invalidText`, which replace the helper), then focus the first error. `useFieldErrors` in `pages/shared` does this, and clears an error when its field changes. A notification at the top of a form or panel is only for errors that don't belong to a field, such as a record updated by someone else or options that failed to load. Show a server error on its field when it names one.
- **Edit mode:** a record page edits one section at a time through `useEditSections`. Entering edit mode focuses the section's first editable field. Save or Cancel returns focus to its Edit button. Create pages don't focus a field; they pass `focusTitle` to `PageHeader`, which focuses the `h1`.
- **Unsaved changes:** a section, form or panel is changed when its values differ from the ones it started with (`useDirtyForm`). Cancel, closing a side panel, switching tabs or leaving the record with changes asks "Discard changes?". Use `useEditSections().confirmLeave` or `useDiscardPrompt`, and `UnsavedChangesGuard` for route changes and reloads. For tab changes, pass the page's complete dirty and busy state through `leaveGuard` to protect queued uploads and item drafts as well as section edits. Keep editing has the initial focus and returns focus to where the user was. On create pages, switching tabs keeps the data without asking.
