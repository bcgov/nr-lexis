# LEXIS architecture

LEXIS is a React single-page application backed by a Spring Boot API. It preserves the shared
Oracle data model and established log-export business workflows while replacing the legacy
server-rendered Java application and its application-server integrations.

## Runtime overview

```mermaid
flowchart LR
    User["Interactive user"] -->|OIDC sign-in| Cognito["FAM / Cognito"]
    User --> Route["OpenShift route"]
    Route --> Frontend["Caddy / Coraza / React"]
    Frontend -->|REST with Cognito JWT| Backend["Spring Boot API<br/>1-N replicas"]

    Nexcol[NEXCOL] -->|Client credentials| Keycloak[Keycloak]
    Nexcol --> Gateway["API gateway"]
    Gateway -->|Scoped federal POST requests| Backend

    Backend --> Oracle[("Shared Oracle database")]
    Backend --> ClamAV["Shared ClamAV service<br/>separate namespace"]
    Backend --> Mail["Government mail relay"]
```

The frontend and backend are separate container images. Caddy serves the static application,
applies Coraza WAF rules, and proxies API traffic to the backend. The backend owns authorization,
validation, workflow coordination, reporting, file inspection, and Oracle access. ClamAV is a
shared service in a separate namespace; the backend reaches its cluster-internal `clamd` endpoint
over TCP rather than deploying a scanner workload of its own.

## Component responsibilities

| Component                | Responsibility                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React frontend           | Interactive provincial, federal, reporting, administration, and RTM AMV journeys. It uses backend-provided capabilities to control navigation and actions.             |
| Spring Boot backend      | REST endpoints, object- and client-level authorization, Oracle workflow coordination, report generation, attachment validation, email events, and operational metrics. |
| Oracle                   | System of record for LEXIS data, reference codes, audit fields, attachments, and the established PL/SQL package contracts.                                             |
| Shared ClamAV            | Malware scanning for uploaded content before accepted files are persisted. The scanner service and signature updates are operated separately from LEXIS.              |
| FAM / Cognito            | Interactive authentication and FAM role authorities, including client-scoped Provincial Submitter access.                                                              |
| Keycloak and API gateway | Dedicated machine-to-machine authentication, scope enforcement, traffic controls, and routing for NEXCOL federal submissions.                                          |
| Mail relay               | Delivery of post-commit workflow notifications from provincial and regional positional mailboxes to validated applicants and regional positional recipients.            |

## Identity and authorization

Interactive users authenticate through FAM's Cognito integration. The backend validates the JWT,
normalizes FAM authorities, and derives the authenticated forest-client scopes where applicable.
The signed `custom:idp_name` claim is also enforced when authorities are created: `idir` identities
can receive only staff roles, while `bceidbusiness` identities can receive only concrete,
client-scoped Provincial Submitter roles. Missing or unknown identity-provider claims and
incompatible role assignments grant no corresponding LEXIS authority.
When FAM assigns a Provincial Submitter to multiple forest clients, LEXIS requires a per-session
active organization selection. The frontend sends that selection with each API request and the
backend validates it against the client-scoped FAM authorities before enforcing it for every
protected object, child resource, download, and mutation. The frontend treats its route and action
guards as user experience controls rather than the security boundary.

FAM delegated administration controls who may assign the five LEXIS application roles. It is a FAM
permission type, not a LEXIS runtime role, and does not grant or appear as application access. FAM
should prevent incompatible identity/role assignments at provisioning time; the backend token guard
is the authoritative runtime control.

NEXCOL does not use an interactive FAM role. It obtains a Keycloak service-client token with the
`lexis:federal-submission:submit` scope and reaches only the federal validation and submission
endpoints exposed by the API gateway. The backend independently validates the forwarded token and
scope.

## Data, files, reports, and integrations

- Oracle remains the system of record; this modernization does not move LEXIS data to another
  database or object store.
- Application, exemption, permit, invoice, and related attachments remain Oracle BLOBs. Uploads
  are size-bounded, type-checked, archive-bounded, and scanned before persistence.
- JasperReports runs inside the backend using checked-in JRXML templates and image-provided fonts
  for PDF compatibility. Render failures are returned as controlled report-generation errors and
  recorded with `event=lexis_report` audit fields. CSV and spreadsheet outputs are generated by
  the backend and streamed to clients.
- Permit detail pages render the permit summary first, then load associated applications and
  package tables. The core-table endpoint returns the authorized applications, packages, and scales
  in one response; the initial permit exemption context reuses the exemption-detail response, and
  fee and GBMS history remain deferred. For normal permits, the backend consumes the existing
  package cursor once, derives application relationships from that same result, and groups the
  existing scale-by-application cursor in a request-scoped lookup. The costly candidate-application
  lookup is deferred until an editor focuses the “Available application” selector, and owner/agent
  client details load only after either corresponding tab is opened. This avoids browser fan-out,
  repeated per-package Oracle reads, and unneeded client lookups or candidate-scale cursors without
  bypassing application authorization. Table-dependent edits and review requests remain unavailable while those
  tables load or refresh, preventing actions against stale data. Package-scoped endpoints verify a
  direct Oracle relationship rather than reloading normal and Blanket OIC package lists for every
  request.
- Canadian permit invoicing remains internal to LEXIS. Non-Canadian invoicing uses the established
  GBMS Oracle package sequence with ordered best-effort coordination and explicit reconciliation
  guidance.
- Provincial submissions enter through the authenticated LEXIS UI. Federal submissions enter
  through NEXCOL and the scoped API path; the modern request path does not recreate the legacy ESF
  application queues.
- Workflow email is published after the database transaction commits and delivered asynchronously
  on a best-effort basis. DEV and TEST replace original recipients with configured override
  recipients.

## Deployment and operations

GitHub Actions builds and scans the frontend and backend images, then deploys them to BC Gov's Gold
OpenShift cluster. The reusable deployment workflow derives the shared scanner endpoint from the
environment-specific `CLAMAV_NAMESPACE` secret. Environment-specific credentials are supplied
through GitHub environment secrets and OpenShift Secrets; non-sensitive behavior is supplied through
environment variables and template parameters.

Pull requests deploy an isolated DEV preview after their required builds and tests pass. A merge to
`main` deploys the accepted images to the persistent TEST environment and runs the smoke suite.
Production deployment and image promotion remain disabled until production readiness is approved.

The backend deployment uses a CPU-based Horizontal Pod Autoscaler with environment-specific minimum
and maximum replica counts. Interactive saves use optimistic version checks: stale saves return a
conflict instead of silently replacing newer work. Short multi-row mutations take Oracle row locks
in a consistent order and rely on Oracle transactions, constraints, and conditional updates for
correctness across replicas.

The daily expiry process is disabled by default and is enabled per environment. JDBC ShedLock uses
`THE.LEXIS_SHEDLOCK` and the existing Oracle datasource so only one backend replica executes a
trigger. It processes each eligible exemption independently, leaves unsuccessful aggregates
eligible for a later run, and publishes metrics for operational monitoring.

Federal validation and CREATE are replica-safe for the NEXCOL contract. CREATE uses best-effort
same-replica replay, while the Oracle package primary key and the application/package/scale
transaction prevent a duplicate package from committing across replicas. A cross-replica retry
that finds an existing package receives a conflict for NEXCOL reconciliation.

## Legacy-to-modern architecture shifts

| Concern              | Legacy                                                                  | Modern                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Application delivery | Java 8 WAR deployed to an application server                            | Separate React/Caddy and Spring Boot workloads on OpenShift, with a shared ClamAV service in its own namespace            |
| Web architecture     | Struts actions, JSP pages, browser JavaScript, and server HTTP sessions | React SPA, typed REST contracts, stateless JWT authentication, and Spring services                                       |
| Interactive identity | WebADE filters, roles, and active organization context                  | FAM roles through Cognito JWTs, per-session active client selection, backend capability resolution, and explicit client/object checks |
| Federal ingress      | ESF queue-oriented ingestion                                            | NEXCOL through a dedicated Keycloak scope and API gateway routes                                                         |
| Persistence          | Oracle tables and PL/SQL packages                                       | The same Oracle system of record behind Spring JDBC repositories and explicit transaction boundaries                     |
| Attachments          | Oracle BLOB storage through application-server upload actions           | Oracle BLOB storage with bounded streaming validation and ClamAV scanning                                                |
| Reports              | Application-server/WebADE report integration and legacy report assets   | Embedded JasperReports with checked-in templates and streamed HTTP responses                                             |
| Email                | Request-coupled JavaMail flows with client and regional positional mailboxes | After-commit asynchronous events, validated recipients, legacy sender/To/Cc positional-mailbox routing, and non-production overrides |
| Concurrency          | Process/session-scoped edit locks in a single runtime                   | Optimistic stale-save conflicts plus ordered Oracle row locks for transactional multi-row mutations                       |
| Delivery             | Legacy build and deployment pipeline                                    | GitHub Actions, container images, security checks, and parameterized OpenShift deployments                               |

The modernization intentionally preserves Oracle contracts, core workflow semantics, BLOB storage,
and the legacy-compatible GBMS sequence. Framework, identity, delivery, ingress, and operational
controls change without introducing another persistence or coordination service.

## Related documentation

- [Backend configuration and API areas](../backend/README.md)
- [Shared ClamAV service](shared-clamav-service.md)
- [Frontend configuration and structure](../frontend/README.md)
- [NEXCOL service-client contract](nexcol-keycloak-service-client.md)
- [Permit invoicing](permit-invoicing.md)
- [Exemption expiry job](exemption-expiry-job.md)
- [Outbound email](outbound-email.md)
