# RTM AMV UI And Persistence Contract

This note records the active RTM Average Monthly Values contract at
`/admin/rtm/emslogamv`. It documents the current single-table implementation while
preserving the legacy `THE.EMS_LOG_AMV` schema and its downstream synchronization trigger.
The legacy workbook upload controller is disabled unless
`lexis.rtm.amv.upload.enabled=true`; it is not part of the active workflow.

## Unified AMV table

- The page shows one editable table. It has no old-growth/second-growth control.
- The displayed value is the old-growth (`O`) baseline. When saved, the same value is written to
  both old growth (`O`) and second growth (`S`).
- The table columns are Balsam (`BA`), Hemlock (`HE`), Cedar (`CE`), Cypress (`CY`), Fir (`FI`),
  Spruce (`SP`), and one friendly Pine column.
- Pine expands to all three legacy species codes: `WH`, `LO`, and `YE`.
- The UI exposes grades `A` through `M`, `U`, `X`, `Y`, `Z`, and `1` through `6`. It does not
  show `W` or the legacy blank-grade row.
- A stored blank grade is still normalized to `BLANK` by the read/API compatibility layer, but it
  is intentionally not editable through the GUI.
- Every listed grid grade is available for every effective month.

`THE.EMS_LOG_AMV` has no `blank` flag; its legacy columns are `SPECIES`, `GRADE`,
`GROWTH_TYPE_ST`, `EFFECTIVE_DATE`, `AVG_MARKET_PRICE`, and `REVISION_COUNT`. The UI therefore
does not invent or submit a `blank = 1` field.

## Dates and values

- The UI accepts a month and always submits the first calendar day of that month.
- The API also normalizes a supported `YYYY-MM-DD` input to that month's first day before it
  queries or saves a value. It does not retain a time-of-day component.
- Retrieval dates are implementation data and are not shown or editable in the UI.
- A value must be numeric, non-negative, at most `9999.99`, and have at most two decimal places.
- A past-month change requires confirmation. A future or empty month can use the latest prior
  old-growth values as an unsaved starting point.
- Values cannot be cleared: `AVG_MARKET_PRICE` is `NOT NULL` and the approved RTM contract has no
  delete operation.

## Atomic grid saves

The active page calls `POST /api/lexis/rtm/emslogamv/batch` once per Save action. The body is a
`values` array containing the dirty logical cells. The prior single-row `POST /emslogamv` route is
not exposed, so a caller cannot bypass the atomic batch contract.

The backend validates the complete request before any write, then expands each logical cell to its
physical targets:

- Every non-Pine cell becomes two writes: its species for `O` and `S`.
- Every Pine cell becomes six writes: `WH`, `LO`, and `YE`, each for `O` and `S`.

The Oracle implementation performs those writes with direct `MERGE` statements inside one Spring
transaction. It uses the existing `INSERT` and `UPDATE` grant on `THE.EMS_LOG_AMV`; it does not
call the legacy row procedures because they commit internally. If any write fails or is not
applied, the transaction is rolled back. An incomplete batch is reported as rejected; a database
failure uses the API's normal service-unavailable response. A successful response is therefore
the confirmation that the complete grid submission was accepted.

## Batch audit event

After the batch service returns, the controller writes one structured
`event=lexis_rtm_amv_batch` application audit event. It records the authenticated
`LexisPrincipalService` identity, a server-generated timestamp, the HTTP status and service
outcome, requested logical-cell count, and written physical-row count. The request has no actor
field, so no client-supplied identity is logged or trusted. If a stable identity cannot be
resolved, the controller logs `identity_rejected`, returns `403 Forbidden`, and does not invoke
the service.

This is an operational audit event rather than a new persisted audit table. It does not change the
legacy RTM schema or claim to satisfy a durable row-level audit requirement by itself.

`SYNC_EMSLA_EXPLA` remains the configured mechanism that mirrors successful table mutations to
`EXPORT_LOG_AMV`. Live downstream-consumer compatibility still needs verification before this
change can claim that every report, integration, and query is unaffected.

## Legacy procedure boundary

`RTM_EMS_LOG_AMV_INSERT` and `RTM_EMS_LOG_AMV_UPDATE` are retained in the database for legacy
compatibility. Both issue `COMMIT`, which makes them unsuitable for the active multi-row UI save.
The active UI does not expose a single-row or workbook mutation route. The optional legacy upload
controller is disabled by default. The read path can still use the direct effective-date query
because the legacy select procedure requires an exact species and growth type.

The table has no user/timestamp audit columns. This change preserves the schema and trigger; it
does not claim to add audit metadata that the legacy data model cannot store.

## Verification coverage

Focused service and UI tests cover the two-growth fan-out, Pine expansion, transaction rollback,
month normalization, the one-table UI, numeric validation, and rejected-batch feedback. The
relevant suites are `OracleRtmEmsLogAmvServiceTest`, `OracleRtmEmsLogAmvRepositoryTest`,
`RtmEmsLogAmvControllerTest`, `RTMEmsLogAmvActions.test.tsx`, and
`rtm-emslogamv-service.test.ts`.

Those tests do not replace live Oracle/TEST verification of direct-`MERGE` grants, rollback,
trigger behavior, or downstream exports.

## Confluence requirement traceability

| Requirement     | Current status             | Evidence or decision needed                                                                                                                         |
| --------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-01           | Data-owner decision        | The existing schema has one physical table with `O` and `S` partitions, not two physical tables.                                                    |
| FR-02 to FR-04  | Implemented                | One user save fans out identical values to `O` and `S` without exposing either choice in the UI.                                                    |
| FR-05 to FR-06  | Implemented                | Friendly species labels are mapped by the service; Pine expands to `WH`, `LO`, and `YE` for both growth partitions.                                 |
| FR-07 to FR-10  | Implemented                | The UI/API normalize to a `LocalDate` month start and do not expose retrieval date input.                                                           |
| FR-11           | Data-owner decision        | `EMS_LOG_AMV` has no submission/update timestamp column; the legacy procedure's update-date parameter is an effective date, not an audit timestamp. |
| FR-12 and FR-14 | Data-owner decision        | The physical table has no blank flag/column to set to `1`.                                                                                          |
| FR-13           | Implemented                | No blank flag is rendered or accepted from the UI.                                                                                                  |
| FR-15           | Implemented                | The editable grade set is `A` through `M`, `U`, `X`, `Y`, `Z`, and `1` through `6`; `W` and blank are hidden.                                       |
| FR-16           | Implemented                | A legacy empty `NEWVAL` is a no-op: clearing an existing cell restores its loaded value on blur and omits it from the batch; blank cells with no stored value remain omitted. |
| FR-17           | Implemented                | The batch service validates before direct `MERGE` writes inside one transaction.                                                                    |
| FR-18           | Partially implemented      | Structured application audit events record the authenticated actor, server timestamp, batch outcome/status, and logical/physical row counts; durable persisted audit still requires an approved table or schema change. |
| FR-19 to FR-20  | Implemented                | Numeric non-negative validation occurs before save; accepted and rejected batch outcomes are returned to the user.                                  |
| FR-21           | Live verification required | The trigger mirrors to `EXPORT_LOG_AMV`, but reports, integrations, and queries still require TEST/downstream validation.                           |

## Outstanding legacy data decisions

The implemented UI behavior is constrained by the existing data model. The following Confluence
requirements need a data-owner decision and an approved persistence design before they can be
implemented without changing legacy semantics:

- Confluence describes separate old-growth and second-growth tables, while the existing schema has
  one `EMS_LOG_AMV` table partitioned by `GROWTH_TYPE_ST` values `O` and `S`. A data owner must
  confirm that those two logical partitions satisfy the requirement before any physical-table
  change is considered.
- `EMS_LOG_AMV` has no `blank` (or equivalent) column, so the system cannot persist `blank = 1`
  for both growth partitions.
- It has no submitting-user, submission-timestamp, or update-timestamp column. A new audit table
  or an approved schema change is required to retain that information.
- `AVG_MARKET_PRICE` is `NOT NULL`; a cleared grid cell is rejected. The legacy blank/clear
  behavior still needs confirmation from the data architect before it is changed.

No schema, trigger, or downstream consumer behavior is inferred or altered by this branch.

## Sources reviewed

- `../nr-mof-db/scripts/THE/TABLES/V2.00906__EMS_LOG_AMV.sql`
- `../nr-mof-db/scripts/THE/PROCEDURES/V7.02649__RTM_EMS_LOG_AMV_INSERT.sql`
- `../nr-mof-db/scripts/THE/PROCEDURES/V7.02650__RTM_EMS_LOG_AMV_SELECT.sql`
- `../nr-mof-db/scripts/THE/PROCEDURES/V7.02651__RTM_EMS_LOG_AMV_UPDATE.sql`
- `../nr-mof-db/scripts/THE/GRANTS/V16.00571__RTM_EXP_LOGAMV_UPD.sql`
- `../nr-mof-db/scripts/THE/TRIGGERS/V11.00299__SYNC_EMSLA_EXPLA.sql`
