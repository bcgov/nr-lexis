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

# Port check
nc -z localhost 8080
```

## Configuration

### Environment Variables

OpenShift receives sensitive values from Secrets and ordinary settings from template parameters. For local development, keep credentials in `src/main/resources/application-local.yml` (gitignored).

| Variable | Description | Default |
|----------|-------------|---------|
| `SERVER_PORT` | Server port | 8080 |
| `SPRING_PROFILES_ACTIVE` | Active profiles | oracle |
| `DATABASE_HOST` | Oracle TCPS hostname used by JDBC and certificate initialization | Required |
| `DATABASE_SERVICE_NAME` | Oracle service name used in the JDBC connection descriptor | Required |
| `DATABASE_USER` | Least-privilege Oracle application account | Required |
| `DATABASE_PASSWORD` | Oracle application-account password | Required |
| `TRUSTSTORE_PATH` | Path to `jssecacerts` JKS | - |
| `KEYSTORE_SECRET` | Password used to create and open the JVM Oracle truststore | Required |
| `ALLOWED_ORIGINS` | Frontend CORS origins | http://localhost:3000 |
| `AWS_COGNITO_ISSUER_URI` | Cognito issuer URI | - |
| `COGNITO_USERINFO_URI` | Cognito userinfo endpoint | - |
| `KEYCLOAK_ISSUER_URI` | Keycloak issuer URI for machine-to-machine NEXCOL service-client tokens; optional locally and required for TEST/PROD deployment | - |
| `KEYCLOAK_JWK_SET_URI` | Optional override for Keycloak JWKS URI; defaults to `<KEYCLOAK_ISSUER_URI>/protocol/openid-connect/certs` when the issuer is set | - |
| `LEXIS_PROD_RTM_ONLY` | Backend enforcement for PROD RTM-only rollout; denies non-session/non-RTM APIs and must be paired with `VITE_LEXIS_PROD_RTM_ONLY` so the UI only shows Average Monthly Values | false |
| `LEXIS_EXPIRY_ENABLED` | Enables the daily exemption-expiry scheduler | false |
| `LEXIS_EXPIRY_CRON` | Spring six-field cron expression for the expiry scheduler | `30 0 0 * * *` |
| `LEXIS_EXPIRY_ZONE` | Business time zone for the expiry scheduler | America/Vancouver |
| `LEXIS_EXPIRY_LOCK_AT_MOST_FOR` | Maximum Oracle ShedLock duration; releases a crashed run | PT6H |
| `LEXIS_EXPIRY_LOCK_AT_LEAST_FOR` | Minimum Oracle ShedLock duration; absorbs multi-pod trigger skew | PT5M |
| `LEXIS_REPORT_QUERY_TIMEOUT_SECONDS` | Maximum JDBC/Jasper report query duration in seconds (1-3600) | 120 |
| `LEXIS_REPORT_STATISTICS_LOG_LEVEL` | Successful report generation/download statistics; DEBUG in DEV/TEST and hidden at the INFO threshold in PROD | INFO |
| `LEXIS_PERMIT_INVOICE_MODE` | Selects `legacy-best-effort`, `canadian-internal`, or `disabled` permit invoice coordination | legacy-best-effort |
| `LEXIS_PERMIT_INVOICE_GBMS_TIMEOUT_SECONDS` | Requested timeout in seconds for each isolated GBMS transaction (1-3600); cancellation can leave the outcome unknown | 60 |
| `LEXIS_VIRUS_SCAN_ENABLED` | Enables ClamAV scanning. Deployed Oracle runtimes refuse to start when this is false. | false locally; true in OpenShift |
| `LEXIS_VIRUS_SCAN_HOST` | Shared ClamAV service hostname | localhost locally; required in OpenShift |
| `LEXIS_VIRUS_SCAN_PORT` | ClamAV INSTREAM port | 3310 |
| `LEXIS_VIRUS_SCAN_TIMEOUT` | End-to-end deadline for one ClamAV scan | 10s |
| `LEXIS_VIRUS_SCAN_CHUNK_SIZE` | Bytes streamed per ClamAV protocol chunk | 8192 |
| `LEXIS_MAIL_NON_PRODUCTION` | Marks DEV/TEST messages and redirects them when override recipients are configured | true outside PROD |
| `LEXIS_MAIL_ENVIRONMENT` | Non-secret environment label shown on intercepted DEV/TEST messages | non-prod locally; derived from deployment environment |
| `LEXIS_MAIL_FROM` | Provincial/system positional sender mailbox | Required in every environment |
| `LEXIS_MAIL_OVERRIDE_RECIPIENTS` | Optional comma/semicolon-separated recipients receiving all DEV/TEST messages instead of the intended recipients | Optional in DEV/TEST; must be unset in PROD |
| `LEXIS_MAIL_REGION_RCO_ADDRESS` | RCO positional mailbox; selected as a sender or recipient by the persisted organization unit | Required in every environment |
| `LEXIS_MAIL_REGION_RNI_ADDRESS` | RNI positional mailbox; selected as a sender or recipient by the persisted organization unit | Required in every environment |
| `LEXIS_MAIL_REGION_RSI_ADDRESS` | RSI positional mailbox; selected as a sender or recipient by the persisted organization unit | Required in every environment |
| `APP_LOG_LEVEL` | Application logging level | INFO |
| `SPRING_JPA_SHOW_SQL` | SQL logging toggle | false |

The reusable deployment workflow maps these GitHub settings:

| Runtime setting | GitHub source |
|---|---|
| `DATABASE_HOST` | Secret `database_host` |
| `DATABASE_SERVICE_NAME` | Secret `database_service_name` |
| `DATABASE_USER` | Secret `database_user` |
| `DATABASE_PASSWORD` | Secret `database_password` |
| `KEYSTORE_SECRET` | Secret `keystore_secret` |
| `LEXIS_PROD_RTM_ONLY` | Secret `lexis_prod_rtm_only` |
| `LEXIS_EXPIRY_ENABLED` | Workflow input `expiry_enabled` |
| `LEXIS_EXPIRY_CRON` | Variable `LEXIS_EXPIRY_CRON` |
| `LEXIS_EXPIRY_ZONE` | Variable `LEXIS_EXPIRY_ZONE` |
| `LEXIS_EXPIRY_LOCK_AT_MOST_FOR` | Variable `LEXIS_EXPIRY_LOCK_AT_MOST_FOR` |
| `LEXIS_EXPIRY_LOCK_AT_LEAST_FOR` | Variable `LEXIS_EXPIRY_LOCK_AT_LEAST_FOR` |
| `LEXIS_REPORT_QUERY_TIMEOUT_SECONDS` | Variable `LEXIS_REPORT_QUERY_TIMEOUT_SECONDS` |
| `LEXIS_REPORT_STATISTICS_LOG_LEVEL` | Derived from the deployment environment |
| `LEXIS_PERMIT_INVOICE_MODE` | Variable `LEXIS_PERMIT_INVOICE_MODE` |
| `LEXIS_PERMIT_INVOICE_GBMS_TIMEOUT_SECONDS` | Variable `LEXIS_PERMIT_INVOICE_GBMS_TIMEOUT_SECONDS` |
| `LEXIS_VIRUS_SCAN_ENABLED` | OpenShift template default `true` |
| `LEXIS_VIRUS_SCAN_HOST` | Environment secret `CLAMAV_NAMESPACE`, referenced as `secrets.clamav_namespace` and resolved to `clamav.<namespace>.svc` |
| `LEXIS_VIRUS_SCAN_PORT` | OpenShift template value `3310` |
| `LEXIS_VIRUS_SCAN_TIMEOUT` | OpenShift template default `10s` |
| `LEXIS_MAIL_NON_PRODUCTION` | Derived from the deployment environment |
| `LEXIS_MAIL_ENVIRONMENT` | Workflow input `environment` |
| `LEXIS_MAIL_FROM` | Secret `LEXIS_MAIL_FROM` |
| `LEXIS_MAIL_OVERRIDE_RECIPIENTS` | Secret `LEXIS_MAIL_OVERRIDE_RECIPIENTS` |
| `LEXIS_MAIL_REGION_RCO_ADDRESS` | Secret `LEXIS_MAIL_REGION_RCO_ADDRESS` |
| `LEXIS_MAIL_REGION_RNI_ADDRESS` | Secret `LEXIS_MAIL_REGION_RNI_ADDRESS` |
| `LEXIS_MAIL_REGION_RSI_ADDRESS` | Secret `LEXIS_MAIL_REGION_RSI_ADDRESS` |

### Virus Scanning

OpenShift deployments use a shared ClamAV service in a separate namespace rather than a
LEXIS-managed scanner workload. The reusable deployment workflow resolves the cluster-local
`clamav.<namespace>.svc:3310` endpoint and supplies its hostname through
`LEXIS_VIRUS_SCAN_HOST`.

See [Shared ClamAV service](../docs/shared-clamav-service.md) for GitHub environment setup,
receiver-side NetworkPolicy requirements, local configuration, and verification.

Backend replicas use optimistic version checks for interactive saves. A stale save returns a
conflict so the user can refresh or explicitly overwrite after reviewing newer changes. Short
multi-row mutations take Oracle row locks in a consistent order, with Oracle transactions,
constraints, and conditional writes as the data-integrity boundary. When expiry is enabled, its
scheduler uses `THE.LEXIS_SHEDLOCK` through the existing Oracle connection.

### Spring Profiles

| Profile | Description |
|---------|-------------|
| `default` | Boots without datasource/JPA autoconfig so backend can run while DB wiring is incomplete. |
| `oracle` | Activates Oracle-profiled repository/service beans (e.g., exemptions service/repository). |
| `local` | Local-dev profile. Loads `application-local.yml` (gitignored). Activate alongside `oracle` (`SPRING_PROFILES_ACTIVE=local,oracle`). |
| `stub-services` | Explicitly enables local in-memory application, admin, upload, and RTM/EMS services. Never use for a deployed environment. The stubs stay disabled when `oracle` is also active. |
| `stub-reports` | Explicitly enables local placeholder report output. Never use for a deployed environment. The stub stays disabled when `oracle` is also active. |

## API Endpoints

Grouped by area; see `controller/` for request and response contracts.

| Area | Base path | Notes |
|---|---|---|
| Actuator | `/actuator/health`, `/actuator/prometheus` | Protected operational endpoints. Requires authentication and `LEXIS_ADMIN`. |
| Session | `/api/lexis/session/*` | Session capabilities and logoff routes. |
| Provincial workflows | `/api/lexis/applications`, `/api/lexis/exemptions`, `/api/lexis/permits`, `/api/lexis/purchase-offers` | Search, options, details, and workflow actions. |
| Federal workflows | `/api/lexis/federal` | Federal application search and detail workflows. |
| Federal submissions | `/api/lexis/federal/submissions`, `/api/lexis/federal/submissions/validation` | NEXCOL machine-to-machine XML validation/submission. Requires the `lexis:federal-submission:submit` Keycloak scope. |
| Reports | `/api/lexis/reports/*` | CSV, PDF, and spreadsheet outputs. |
| Admin and uploads | `/api/lexis/admin/*`, `/api/lexis/*Upload` | Policy administration and upload workflows. |

See [../docs/nexcol-keycloak-service-client.md](../docs/nexcol-keycloak-service-client.md) for
the NEXCOL Keycloak service-client setup and request shape. OpenShift exposes this backend only
through its cluster-local Service. Interactive browser APIs arrive through the frontend proxy;
the NEXCOL-only paths arrive through the API gateway.

See [../docs/permit-invoicing.md](../docs/permit-invoicing.md) for GBMS ordering, recovery, and
rollout modes. See [../docs/outbound-email.md](../docs/outbound-email.md) for non-production mail
safety.

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
