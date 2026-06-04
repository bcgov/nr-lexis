[![License](https://img.shields.io/github/license/bcgov/nr-lexis.svg)](/LICENSE)
[![Merge](https://github.com/bcgov/nr-lexis/actions/workflows/merge.yml/badge.svg)](https://github.com/bcgov/nr-lexis/actions/workflows/merge.yml)
[![Analysis](https://github.com/bcgov/nr-lexis/actions/workflows/analysis.yml/badge.svg)](https://github.com/bcgov/nr-lexis/actions/workflows/analysis.yml)
[![Scheduled](https://github.com/bcgov/nr-lexis/actions/workflows/scheduled.yml/badge.svg)](https://github.com/bcgov/nr-lexis/actions/workflows/scheduled.yml)

# LEXIS - Log Exemption Information System

Full-stack LEXIS application for log export workflows.

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
npm run dev
```

Frontend: `http://localhost:3000`

### Optional Docker Compose flow

```bash
docker compose up
docker compose --profile caddy up caddy
```

This runs Spring Boot + Vite locally with the same Oracle-backed assumptions (VPN + local Oracle config files).

### Jasper report parity check

Use the checked-in parity harness when both this backend and `nr-lexis-main` are running against the same Oracle data. It calls the modern Spring report API and the legacy Struts report URL for each case in `tools/report-parity-cases.json`.

```bash
LEGACY_REPORT_BASE_URL=http://localhost:8081/nr-lexis \
REPORT_PARITY_COOKIE='SESSION=...' \
REPORT_REGION=1904 \
REPORT_SCHEDULE_ID=12345 \
APPROVED_EXEMPTION_NUMBER=EX-12345 \
PERMIT_NUMBER=900100 \
node tools/compare-report-parity.mjs \
  --modern-base http://localhost:8080/api/lexis/reports \
  --out-dir /tmp/lexis-report-parity
```

CSV cases cover every legacy CSV generator and compare exact bytes. PDF and spreadsheet cases compare HTTP status, content type, filename extension, byte count, and hashes because generated report metadata can vary by renderer. The tenure spreadsheet cases cover all four legacy action mappings: permit, tenure type, timber mark, and forest file. Use `--exact-binary` when you need strict byte equality. `--out-dir` writes both generated files and a metadata JSON record per case for follow-up diffing. Requests default to a 120 second timeout; override it with `--timeout-ms` or `REPORT_PARITY_TIMEOUT_MS` for slow Oracle-backed runs.

## CI/CD

GitHub Actions handles PR checks, image builds, and OpenShift deployments. Namespace and credential values are environment-driven through repository/environment secrets and variables.

## Component docs

- [backend/README.md](backend/README.md)
- [frontend/README.md](frontend/README.md)

## Notes

- Source-of-truth legacy behavior reference: `nr-lexis-main`.
- Repository structure and operational conventions reference: `nr-rept`.
