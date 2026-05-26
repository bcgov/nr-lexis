# LEXIS Backend

Spring Boot backend service for the Log Exemption Information System (LEXIS).

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Java | 21 | Runtime |
| Spring Boot | 3.5.x | Framework |
| Oracle JDBC | 21.3.x (ojdbc11) | Oracle connectivity |
| Undertow | 2.3.x | Embedded HTTP server (Tomcat excluded) |
| JasperReports | 6.21.5 | Report generation library |
| Resilience4j | 2.3.x | Retry / circuit-breaker support |
| Micrometer Prometheus | Spring Boot managed | Metrics export |

## Running Locally

```bash
# Run backend
mvn spring-boot:run

# Health checks
curl http://localhost:8080/actuator/health
curl http://localhost:8080/actuator/prometheus
```

## Configuration

### Environment Variables

In OpenShift deployments these come from the Secret created by `openshift.deploy.yml`. For local setup, start from `.env.example`.

| Variable | Description | Default |
|----------|-------------|---------|
| `SERVER_PORT` | Server port | 8080 |
| `SPRING_PROFILES_ACTIVE` | Active profiles | oracle |
| `DATABASE_HOST` | Oracle host | - |
| `DATABASE_SERVICE_NAME` | Oracle service name | - |
| `DATABASE_USER` | Oracle username | - |
| `DATABASE_PASSWORD` | Oracle password | - |
| `KEYSTORE_SECRET` | Oracle truststore secret/passphrase | - |
| `ALLOWED_ORIGINS` | Frontend CORS origins | http://localhost:3000 |
| `APP_LOG_LEVEL` | Application logging level | INFO |
| `SPRING_JPA_SHOW_SQL` | SQL logging toggle | false |
| `J_URL_FETCH` | Jasper endpoint (when wired) | - |
| `J_USERNAME` | Jasper username (when wired) | - |
| `J_PASSWORD` | Jasper password (when wired) | - |

### Spring Profiles

| Profile | Description |
|---------|-------------|
| `default` | Boots without datasource/JPA autoconfig so backend can run while DB wiring is incomplete. |
| `oracle` | Activates Oracle-profiled repository/service beans (e.g., exemptions service/repository). |

## API Endpoints

Grouped by area; see `controller/` for request and response contracts.

| Area | Base path | Notes |
|---|---|---|
| Actuator | `/actuator/health`, `/actuator/prometheus` | Public health and metrics endpoints. |
| Applications | `/api/lexis/applications/search`, `/search/options`, `/{applicationNumber}` | Application search/detail endpoints. |
| Application validation | `/api/lexis/applications/search/verify-clients`, `/search/has-valid-offer` | Validation helpers for selected applications. |
| Permits | `/api/lexis/permits/search`, `/search/options`, `/{permitNumber}` | Provincial permit search/detail endpoints; Oracle service is profile-gated. |
| Purchase offers | `/api/lexis/purchase-offers/search`, `/search/options`, `/{offerNumber}` | Purchase-offer search/detail endpoints; Oracle service is profile-gated. |
| Exemptions | `/api/lexis/exemptions/search`, `/search/options`, `/{exemptionNumber}` | Exemptions search/detail endpoints; Oracle service is profile-gated. |

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
    └── application.yml
```

## Origins

This backend follows the modern Spring Boot layout used in `nr-rept`, while functionality is being ported incrementally from `nr-lexis-main`.

Upstream CI/CD and OpenShift template conventions come from [bcgov/quickstart-openshift](https://github.com/bcgov/quickstart-openshift).

## Resources

[NRM Architecture Confluence: GitHub Repository Best Practices](https://apps.nrs.gov.bc.ca/int/confluence/x/TZ_9CQ)
