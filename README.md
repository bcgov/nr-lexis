[![License](https://img.shields.io/github/license/bcgov/nr-lexis.svg)](/LICENSE)
[![Merge](https://github.com/bcgov/nr-lexis/actions/workflows/merge.yml/badge.svg)](https://github.com/bcgov/nr-lexis/actions/workflows/merge.yml)
[![Analysis](https://github.com/bcgov/nr-lexis/actions/workflows/analysis.yml/badge.svg)](https://github.com/bcgov/nr-lexis/actions/workflows/analysis.yml)
[![Scheduled](https://github.com/bcgov/nr-lexis/actions/workflows/scheduled.yml/badge.svg)](https://github.com/bcgov/nr-lexis/actions/workflows/scheduled.yml)
[![BCeID Regression](https://github.com/bcgov/nr-lexis/actions/workflows/bceid-regression.yml/badge.svg)](https://github.com/bcgov/nr-lexis/actions/workflows/bceid-regression.yml)

# LEXIS - Log Exemption Information System

Full-stack LEXIS application for log export workflows.

| Component | Technology |
|-----------|------------|
| Frontend | React 19, TypeScript, Carbon Design System |
| Backend | Spring Boot 3.5, Java 21 |
| Database | Oracle (shared, BC Gov-managed) |
| Auth | AWS Cognito (FAM) |
| Reports | JasperReports library |

## Local Development

Two supported ways to run LEXIS locally. Pick whichever fits your workflow.

| | Option A - direct on host | Option B - Docker Compose |
|---|---|---|
| **Backend hot reload** | Manual restart | Manual restart |
| **Frontend hot reload (Vite HMR)** | Yes | Yes |
| **First-time setup cost** | Install Java 21 + Node 22 on host | Just Docker Desktop |
| **Best for** | Day-to-day backend/frontend work | Quick smoke tests, frontend-only work, and container parity |

Both options share the same prerequisites and property files below. Reports use the checked-in JRXML templates in the Spring Boot backend.

### Shared prerequisites

1. **Network access to the BC Gov Oracle environment.** Compose cannot route that for you.
2. **Maven 3.9+ and Java 21** (Option A only). The repo has no Maven wrapper.
3. **Node 22+** (Option A only).
4. **Docker Desktop** (Option B only).

### Property files you create once

These files are gitignored and stay local.

#### `backend/src/main/resources/application-local.yml`

Activated by the Spring `local` profile. Holds Oracle credentials, Cognito issuer/userinfo URIs, IDIR base URL, and `TRUSTSTORE_PATH`. Obtain these values through approved team channels and keep them out of git.

For Option B, Compose overrides `TRUSTSTORE_PATH` inside Docker to `/app/src/main/resources/cert/jssecacerts`; no local edit is needed for the container path.

#### `backend/src/main/resources/cert/jssecacerts`

Java keystore containing the trusted CA chain for the Oracle TLS connection. Obtain it through approved team channels and keep it out of git.

#### `frontend/.env`

Copy `frontend/.env.example` and fill in the Cognito client values. Vite inlines these values into the app bundle, so restart `npm run dev` after changing `.env`.

### Option A - direct on host

Run the backend and frontend in separate terminal tabs.

**Backend:**

```bash
cd backend
mvn -DskipTests spring-boot:run -Dspring-boot.run.profiles=local,oracle
```

Port check:

```bash
nc -z localhost 8080
```

**Frontend:**

```bash
cd frontend
npm ci
npm run dev
```

Frontend: `http://localhost:3000`

### Option B - Docker Compose

```bash
docker compose up           # foreground; Ctrl-C to stop
docker compose up -d        # detached
docker compose down         # stop containers, keep cache
docker compose down -v      # stop + drop the Maven cache volume
docker compose logs -f backend
```

Services:

- `backend` -> `localhost:8080` (Spring Boot via `mvn spring-boot:run` inside `maven:3.9.9-amazoncorretto-21-alpine`).
- `frontend` -> `localhost:3000` (Vite via `npm run dev` inside `node:22-alpine`).

First `up` downloads Maven dependencies into the `maven-cache` named volume. Subsequent starts are faster.

An optional production-like frontend variant is on the `caddy` profile:

```bash
docker compose --profile caddy up caddy backend
```

That builds the real `frontend/Dockerfile` and serves it at `localhost:3005`.

#### Compose-specific gotchas

- If you Ctrl-C mid dependency download, Maven can leave partial files in `maven-cache`. Fix with `docker compose down -v && docker compose up`.
- The backend is not hot-reloading. Java changes need `docker compose restart backend`.
- HMR uses WebSocket from your browser to `localhost:3000`. If you remap the published port, also override `VITE_HMR_PORT` in `docker-compose.yml`.

### Verifying it works

Regardless of option:

- `nc -z localhost 8080` succeeds once the backend port is listening.
- Open `http://localhost:3000` and complete the Cognito login round trip.

If the backend starts but authenticated API calls fail, check network access, `application-local.yml` credentials, Cognito config, and the truststore path.

## Component docs

- [backend/README.md](backend/README.md) - Spring profile reference, env-var table, API areas, test commands.
- [frontend/README.md](frontend/README.md) - Vite scripts, env-var table, project structure, testing libraries.
