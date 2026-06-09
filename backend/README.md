# LEXIS Backend

Spring Boot backend service for the Log Exemption Information System (LEXIS).

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Java | 21 | Runtime |
| Spring Boot | 3.5.x | Framework |
| Spring Security | Spring Boot managed | OAuth2 Resource Server + JWT |
| Oracle JDBC | 21.3.x (ojdbc11) | Database connectivity (TCPS to BC Gov shared Oracle) |
| Undertow | 2.3.x | Embedded HTTP server (Tomcat excluded) |
| JasperReports | 6.21.5 | Embedded report generation; no Jasper Server |
| Resilience4j | 2.3.x | Retry / circuit-breaker support |
| Micrometer Prometheus | Spring Boot managed | Metrics export |

## Running Locally

See the [root README's Local Development section](../README.md#local-development) for direct host and Docker Compose workflows, plus the local property-file setup.

```bash
# Run backend with local + Oracle profiles
mvn -DskipTests spring-boot:run -Dspring-boot.run.profiles=local,oracle

# Health checks
curl http://localhost:8080/actuator/health
curl http://localhost:8080/actuator/prometheus
```

## Configuration

### Environment Variables

In OpenShift deployments these come from the Secret created by `openshift.deploy.yml`. For local development, keep credentials in `src/main/resources/application-local.yml` (gitignored).

Reports are rendered in-process with the embedded JasperReports library and the templates under `src/main/resources/reports/lexis`. The modern backend does not call Jasper Server and does not require Jasper URL, username, or password environment variables.

| Variable | Description | Default |
|----------|-------------|---------|
| `SERVER_PORT` | Server port | 8080 |
| `SPRING_PROFILES_ACTIVE` | Active profiles | oracle |
| `DATABASE_HOST` | Oracle host | - |
| `DATABASE_SERVICE_NAME` | Oracle service name | - |
| `DATABASE_USER` | Oracle username | - |
| `DATABASE_PASSWORD` | Oracle password | - |
| `TRUSTSTORE_PATH` | Path to `jssecacerts` JKS | - |
| `KEYSTORE_SECRET` | Oracle truststore secret/passphrase | - |
| `ALLOWED_ORIGINS` | Frontend CORS origins | http://localhost:3000 |
| `AWS_COGNITO_ISSUER_URI` | Cognito issuer URI | - |
| `COGNITO_USERINFO_URI` | Cognito userinfo endpoint | - |
| `IDENTITY_LOOKUP_BASE_URL` | FAM identity lookup base URL | - |
| `APP_LOG_LEVEL` | Application logging level | INFO |
| `SPRING_JPA_SHOW_SQL` | SQL logging toggle | false |

### Spring Profiles

| Profile | Description |
|---------|-------------|
| `default` | Boots without datasource/JPA autoconfig so backend can run while DB wiring is incomplete. |
| `oracle` | Activates Oracle-profiled repository/service beans (e.g., exemptions service/repository). |
| `local` | Local-dev profile. Loads `application-local.yml` (gitignored). Activate alongside `oracle` (`SPRING_PROFILES_ACTIVE=local,oracle`). |

## API Endpoints

Grouped by area; see `controller/` for request and response contracts.

| Area | Base path | Notes |
|---|---|---|
| Actuator | `/actuator/health`, `/actuator/prometheus` | Public health and metrics endpoints. |
| Session | `/api/lexis/session/*` | Session capabilities, legacy action visibility, and logoff compatibility routes. |
| Applications | `/api/lexis/applications/search`, `/search/options`, `/{applicationNumber}` | Application search/detail endpoints. |
| Application validation | `/api/lexis/applications/search/verify-clients`, `/search/has-valid-offer` | Validation helpers for selected applications. |
| Application review | `/api/lexis/application-reviews/search`, `/search/options`, status actions | Provincial review queue and status workflows. |
| Permits | `/api/lexis/permits/search`, `/search/options`, `/{permitNumber}` | Provincial permit search/detail endpoints. |
| Purchase offers | `/api/lexis/purchase-offers/search`, `/search/options`, `/{offerNumber}` | Purchase-offer search/detail endpoints. |
| Exemptions | `/api/lexis/exemptions/search`, `/search/options`, `/{exemptionNumber}` | Exemptions search/detail endpoints. |
| Federal applications | `/api/lexis/federal/applications/search`, `/search/options`, `/{applicationNumber}` | Federal application search/detail endpoints. |
| Indian Reserve permits | `/api/lexis/indian-reserve/permits/search`, `/search/options`, `/{permitNumber}` | Indian Reserve permit search/detail endpoints. |
| Reports | `/api/lexis/reports/*` | Generates CSV, PDF, and spreadsheet outputs with embedded JasperReports templates and legacy-compatible routes. |
| Admin and uploads | `/api/lexis/admin/*`, `/api/lexis/*Upload` | Admin policy screens and legacy upload workflows. |
| Permit detail RPC | `/api/lexis/rpc/permit-details/*` | Legacy-compatible permit detail tables, documents, invoices, and mutation workflows. |

## Testing

```bash
# Run all tests
mvn test

# Skip tests during build
mvn package -DskipTests
```

## Project Structure

```text
backend/
├── Dockerfile
├── openshift.deploy.yml
├── openshift/
│   └── deployment.yaml
├── pom.xml
├── src/main/java/ca/bc/gov/mof/lexis/
│   ├── LexisApiApplication.java
│   ├── controller/
│   ├── dto/
│   ├── repository/
│   └── service/
└── src/main/resources/
    ├── application.yml
    ├── application-oracle.yml
    ├── application-local.yml (gitignored, local only)
    ├── fonts/
    └── reports/lexis/
```
