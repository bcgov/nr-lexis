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
| JasperReports | 6.21.5 | Report generation |
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
| Session | `/api/lexis/session/*` | Session capabilities and logoff routes. |
| Provincial workflows | `/api/lexis/applications`, `/api/lexis/exemptions`, `/api/lexis/permits`, `/api/lexis/purchase-offers` | Search, options, details, and workflow actions. |
| Federal and reserve workflows | `/api/lexis/federal`, `/api/lexis/indian-reserve` | Federal application and reserve permit workflows. |
| Reports | `/api/lexis/reports/*` | CSV, PDF, and spreadsheet outputs. |
| Admin and uploads | `/api/lexis/admin/*`, `/api/lexis/*Upload` | Policy administration and upload workflows. |

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
