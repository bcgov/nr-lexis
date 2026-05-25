# LEXIS Spring Backend Bootstrap

This module is the Java 21 / Spring Boot 3 backend bootstrap for the LEXIS modernization.

## Run

```bash
mvn -DskipTests spring-boot:run
```

## Verify

```bash
curl http://localhost:8080/actuator/health
curl http://localhost:8080/actuator/prometheus
```

## Notes

- Oracle datasource and JPA configuration are intentionally not wired yet.
- Default autoconfiguration excludes DB/JPA so the service can start while we port legacy functionality.
- First migration slice scaffold is now in place for legacy `/applicationSearch` and `/applicationDetails`.

## Migrated Slice Endpoints (Scaffold)

- `GET /api/lexis/applications/search/options`
- `GET /api/lexis/applications/search`
- `GET /api/lexis/applications/{applicationNumber}`
- `GET /api/lexis/applications/search/verify-clients?applications=1000123,1000456`
- `GET /api/lexis/applications/search/has-valid-offer?applications=1000456`

Current implementation uses an in-memory service (`!oracle` profile). Oracle-backed repository/service wiring is the next step.
