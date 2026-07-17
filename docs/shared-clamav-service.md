# Shared ClamAV service

LEXIS uses a shared ClamAV service in a separate OpenShift namespace. LEXIS does
not build, deploy, or operate a ClamAV image or database. The backend sends file
contents to `clamd` over its TCP `INSTREAM` protocol on port `3310` before the
file is accepted.

## Deployment configuration

Create the `CLAMAV_NAMESPACE` GitHub environment secret for each LEXIS deployment
environment. The reusable deployment workflow consumes it as
`secrets.clamav_namespace` and resolves the backend endpoint as:

```text
clamav.<CLAMAV_NAMESPACE>.svc:3310
```

The secret value is only the namespace hosting that environment's shared ClamAV
Service; do not provide a hostname, protocol, or port. Keep the DEV, TEST, and
PROD values mapped to their matching scanner environments. The secret is required
by the reusable deployment workflow, so a deployment fails early if it is absent.
It is the only ClamAV-specific GitHub secret.

LEXIS deployment, promotion, and PR cleanup workflows manage only the backend and frontend
workloads. A LEXIS preview never creates, promotes, or deletes a ClamAV workload.

The OpenShift template injects the resolved hostname as `LEXIS_VIRUS_SCAN_HOST`.
It enables scanning, uses TCP port `3310`, and has a 10-second socket timeout.
The service is cluster-internal: no OpenShift Route or HTTP ingress is used.

## Network policy

The ClamAV namespace owner must allow inbound TCP `3310` from the matching LEXIS
application namespace. The policy belongs in the ClamAV namespace because it
selects the scanner pods:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-<lexis-namespace>-to-clamav
  namespace: <clamav-namespace>
  labels:
    app.kubernetes.io/managed-by: nr-lexis
    app.kubernetes.io/part-of: nr-lexis
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: clamav
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: <lexis-namespace>
      ports:
        - protocol: TCP
          port: 3310
```

Replace both placeholders for each environment. Do not copy server-managed fields
such as `uid`, `resourceVersion`, `creationTimestamp`, or `managedFields` from an
OpenShift console export.

LEXIS does not currently need an additional backend egress NetworkPolicy for this
connection. If a backend egress policy is introduced later, it must allow TCP
`3310` to the matching shared ClamAV service.

## Local development and verification

Virus scanning is disabled by default for local development. To exercise it
locally, configure a reachable ClamAV endpoint with
`LEXIS_VIRUS_SCAN_ENABLED`, `LEXIS_VIRUS_SCAN_HOST`, `LEXIS_VIRUS_SCAN_PORT`, and
optionally `LEXIS_VIRUS_SCAN_TIMEOUT` in
`backend/src/main/resources/application-local.yml`.

The TEST credentialed regression suite (`frontend/e2e/regression.spec.ts`) submits the EICAR
test payload to upload and submission endpoints and expects rejection. It verifies the deployed
backend can reach the shared scanner. `ClamAvVirusScanServiceTest` covers the `INSTREAM` protocol;
`ClamAvDeploymentConfigTest` verifies the shared endpoint wiring for DEV, TEST, and PROD and
ensures PR cleanup does not manage a local scanner workload.

## Cutover and ownership

Before moving an environment, apply the receiver-side policy, configure its
GitHub environment secret, deploy LEXIS, and run the TEST virus-scan regression.
After the shared scanner is verified, remove any legacy LEXIS-owned ClamAV
resources still running in the LEXIS namespace. Template changes do not delete
previously created OpenShift objects.

LEXIS owns the backend configuration and deployment wiring. The shared ClamAV
service owner owns the ClamAV deployment, signature updates, service availability,
and its receiver-side NetworkPolicy.
