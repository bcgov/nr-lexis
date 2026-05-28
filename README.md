[![License](https://img.shields.io/github/license/bcgov/nr-lexis.svg)](/LICENSE)
[![Merge](https://github.com/bcgov/nr-lexis/actions/workflows/merge.yml/badge.svg)](https://github.com/bcgov/nr-lexis/actions/workflows/merge.yml)
[![Analysis](https://github.com/bcgov/nr-lexis/actions/workflows/analysis.yml/badge.svg)](https://github.com/bcgov/nr-lexis/actions/workflows/analysis.yml)
[![Scheduled](https://github.com/bcgov/nr-lexis/actions/workflows/scheduled.yml/badge.svg)](https://github.com/bcgov/nr-lexis/actions/workflows/scheduled.yml)

# LEXIS - Log Exemption Information System

Full-stack LEXIS application for log export workflows. This repository uses the modern `nr-rept`-style structure and tooling while preserving business behavior from `nr-lexis-main`.

| Component | Technology |
|-----------|------------|
| Frontend | React 19, TypeScript, Carbon Design System |
| Backend | Spring Boot 3.5, Java 21 |
| Database | Oracle |
| Auth | AWS Cognito (FAM roles) |
| Reports | JasperReports library (embedded) |

## Local Development

Primary workflow is direct local run (backend + frontend in separate terminals).

### Prerequisites

1. BC Gov VPN connected (required for Oracle connectivity).
2. Java 21 and Maven 3.9+.
3. Node 22+.
4. Docker Desktop (optional).

### Local configuration files

These files are gitignored and stay local:

1. `backend/src/main/resources/application-local.yml`
2. `backend/src/main/resources/cert/jssecacerts`
3. `frontend/.env` (copy from `frontend/.env.example`)

### Run backend

```bash
cd backend
mvn -DskipTests spring-boot:run -Dspring-boot.run.profiles=local,oracle
```

Health checks:

```bash
curl http://localhost:8080/actuator/health
curl http://localhost:8080/actuator/prometheus
```

### Run frontend

```bash
cd frontend
npm ci
PORT=3000 npm run dev
```

Frontend: `http://localhost:3000`

### Optional Docker Compose flow

```bash
docker compose up
docker compose --profile caddy up caddy
```

This runs Spring Boot + Vite locally with the same Oracle-backed assumptions (VPN + local Oracle config files).

## CI/CD

GitHub Actions handles PR checks, image builds, and OpenShift deployments. Namespace and credential values are environment-driven through repository/environment secrets and variables.

## Component docs

- [backend/README.md](backend/README.md)
- [frontend/README.md](frontend/README.md)

## Notes

- Source-of-truth legacy behavior reference: `nr-lexis-main`.
- Modern structure and operational conventions reference: `nr-rept`.
