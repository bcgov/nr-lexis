# RTM AMV UI And Persistence Contract

This note records the active RTM Average Monthly Values contract. Administrators can maintain
values through the editable grid at `/admin/rtm/emslogamv` or the transitional workbook workflow
at `/admin/rtm/emslogamv/upload`. Both preserve the legacy `THE.EMS_LOG_AMV` schema and its
downstream synchronization trigger.

## Editable AMV grid

- The page shows one editable table. It has no old-growth/second-growth control.
- The displayed value is the old-growth (`O`) baseline. When saved, the same value is written to
  both old growth (`O`) and second growth (`S`).
- User-facing copy intentionally describes one monthly value only; it does not expose the
  underlying growth-partition persistence behavior.
- The table columns are Balsam (`BA`), Hemlock (`HE`), Cedar (`CE`), Cypress (`CY`), Fir (`FI`),
  Spruce (`SP`), and one friendly Pine column.
- Spruce maps one-to-one to physical `SP`; it does not expand like Pine.
- Pine expands to all three legacy species codes: `WH`, `LO`, and `YE`.
- The UI exposes grades `A` through `M`, `U`, `X`, `Y`, `Z`, and `1` through `6`. It does not
  show `W` or the legacy blank-grade row.
- A stored blank grade is still normalized to `BLANK` by the read/API compatibility layer, but it
  is intentionally not editable through the GUI.
- Every listed grid grade is available for every effective month.

`THE.EMS_LOG_AMV` has no `blank` flag; its legacy columns are `SPECIES`, `GRADE`,
`GROWTH_TYPE_ST`, `EFFECTIVE_DATE`, `AVG_MARKET_PRICE`, and `REVISION_COUNT`. The UI therefore
does not invent or submit a `blank = 1` field.

### Clarified legacy `BLANK` semantics

The legacy `BLANK` label is a display alias for a space-valued `GRADE` (`' '`) row. It is not a
column or a flag. The legacy UI submitted that row as `GRADE = ' '`, the select procedure returned
it as `BLANK`, and the table trigger normalizes an omitted or trimmed grade to a space. The active
UI intentionally omits that row, as requested; it does not replace it with a new `blank = 1`
attribute.

Likewise, legacy `UPDATE_DATE` is a user-entered effective month. It is not the timestamp of the
last submission: the legacy update procedure uses a later value to create a new effective-dated
version and an equal value to update the current one. The active UI supplies the effective month
only and does not misrepresent it as audit metadata.

## Dates and values

- The UI accepts a month and always submits the first calendar day of that month.
- The API also normalizes a supported `YYYY-MM-DD` input to that month's first day before it
  queries or saves a value. It does not retain a time-of-day component.
- Retrieval dates are implementation data and are not shown or editable in the UI.
- A value must be numeric, non-negative, at most `9999.99`, and have at most two decimal places.
- Past months never prefill. They remain editable, and multiple changes are saved together as one
  atomic batch after confirmation.
- An empty current month can use values from the immediately preceding calendar month as an
  unsaved starting point.
- A future month can use the latest available earlier values as an unsaved starting point.
- Values cannot be cleared: `AVG_MARKET_PRICE` is `NOT NULL` and the approved RTM contract has no
  delete operation.
- In the grid, a single dash (`-`) is treated as an empty value. It warns when a copied starting
  value is omitted from the batch; it is never persisted as a value, and negative numbers remain
  invalid.

## Atomic grid saves

The active page calls `POST /api/lexis/rtm/emslogamv/batch` once per Save action. The body is a
`values` array containing the dirty logical cells. The prior single-row `POST /emslogamv` route is
not exposed, so a caller cannot bypass the atomic batch contract.

The backend validates the complete request before any write, then expands each logical cell to its
physical targets:

- Every non-Pine cell becomes two writes: its species for `O` and `S`.
- Every Pine cell becomes six writes: `WH`, `LO`, and `YE`, each for `O` and `S`.

The Oracle implementation performs those writes with direct `MERGE` statements inside one Spring
transaction. It requires the deployed LEXIS database user to have direct `INSERT` and `UPDATE`
access to `THE.EMS_LOG_AMV`; it does not call the legacy row procedures because they commit
internally. If any write fails or is not applied, the transaction is rolled back. An incomplete
batch is reported as rejected; a database failure uses the API's normal service-unavailable
response. A successful response is therefore the confirmation that the complete grid submission
was accepted.

## Atomic workbook uploads

The separate workbook page retains the XLSX template, validation, preview, and review flow so the
client can compare it with the editable grid during the transition period. Preview calls
`POST /api/lexis/rtm/emslogamv/preview`; final submission calls
`POST /api/lexis/rtm/emslogamv/upload`. Both routes require `/lexisAgentAdmin`, including when the
application runs in PROD RTM-only mode.

The backend scans the workbook for malware, validates its shape, dates, dimensions, and values,
and retains only workbook keys that exist for the retrieval month. Final submission converts all
eligible workbook rows to direct `MERGE` targets and writes them in one Spring transaction. It does
not call the legacy row procedures. If any target is not applied or the database write fails, the
complete workbook transaction rolls back and the upload reports zero saved rows.

## Batch audit event

After the controller resolves a batch outcome, it writes one structured
`event=lexis_rtm_amv_batch` application audit event. It records the authenticated
`LexisPrincipalService` identity, a server-generated timestamp, the HTTP status and service
outcome, requested logical-cell count, and written physical-row count. Accepted, rejected,
identity-rejected, and unexpected database outcomes are all recorded. The request has no actor
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
compatibility. Both issue `COMMIT`, which makes them unsuitable for either active multi-row save.
The grid and workbook upload therefore use the same direct transactional `MERGE` implementation;
no single-row mutation route is exposed. The read path can still use the direct effective-date
query because the legacy select procedure requires an exact species and growth type.

The table has no user/timestamp audit columns. This change preserves the schema and trigger; it
does not claim to add audit metadata that the legacy data model cannot store.

## Confluence requirement traceability

| Requirement     | Current status             | Evidence or decision needed                                                                                                                         |
| --------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-01           | Implemented                | The existing schema represents the required old-growth and second-growth values as `O` and `S` partitions in one physical table.                    |
| FR-02 to FR-04  | Implemented                | One user save fans out identical values to `O` and `S` without exposing either choice in the UI.                                                    |
| FR-05 to FR-06  | Implemented                | Friendly species labels are mapped by the service; Pine expands to `WH`, `LO`, and `YE` for both growth partitions.                                 |
| FR-07 to FR-10  | Implemented                | The UI/API normalize to a `LocalDate` month start and do not expose retrieval date input.                                                           |
| FR-11           | Confluence correction needed | `EMS_LOG_AMV` has no submission/update timestamp column; the legacy update-date value is an effective month, not an audit timestamp.              |
| FR-12 and FR-14 | Confluence correction needed | `BLANK` is the legacy display alias for `GRADE = ' '`; the physical table has no blank flag/column to set to `1`.                                  |
| FR-13           | Implemented                | No blank flag is rendered or accepted from the UI.                                                                                                  |
| FR-15           | Implemented                | The editable grade set is `A` through `M`, `U`, `X`, `Y`, `Z`, and `1` through `6`; `W` and blank are hidden.                                       |
| FR-16           | Implemented                | A legacy empty `NEWVAL` is a no-op: clearing an existing cell restores its loaded value on blur and omits it from the batch; a single dash is treated as the same blank marker; blank cells with no stored value remain omitted. |
| FR-17           | Implemented                | Grid batches and workbook submissions validate before direct `MERGE` writes inside one transaction.                                                 |
| FR-18           | Partially implemented      | Structured application audit events record the authenticated actor, server timestamp, batch outcome/status, and logical/physical row counts; durable persisted audit still requires an approved table or schema change. |
| FR-19 to FR-20  | Implemented                | Numeric non-negative validation occurs before save; accepted and rejected batch outcomes are returned to the user.                                  |
| FR-21           | Live verification required | The trigger mirrors to `EXPORT_LOG_AMV`, but reports, integrations, and queries still require TEST/downstream validation.                           |

## Legacy schema constraints

The implemented UI behavior is constrained by the existing data model:

- Legacy RTM allowed a user to enter one physical growth partition at a time. The active unified
  table intentionally applies the Confluence O/S fan-out rule instead; no physical-table change is
  required because `EMS_LOG_AMV` stores the partitions through `GROWTH_TYPE_ST`.
- `BLANK` is a legacy grade sentinel (`GRADE = ' '`), not a column. The Confluence `blank = 1`
  wording needs correction before a new flag or column is considered.
- It has no submitting-user, submission-timestamp, or update-timestamp column. A new audit table
  or an approved schema change is required to retain that information.
- `AVG_MARKET_PRICE` is `NOT NULL`; legacy code treats an empty value as a no-op. The active UI
  preserves that behavior by restoring a cleared stored value on blur and omitting it from the
  batch. Product confirmation is still needed if a delete behavior is desired instead.

No schema, trigger, or downstream consumer behavior is inferred or altered by this branch.

## Sources reviewed

- `../nr-mof-db/scripts/THE/TABLES/V2.00906__EMS_LOG_AMV.sql`
- `../nr-mof-db/scripts/THE/PROCEDURES/V7.02649__RTM_EMS_LOG_AMV_INSERT.sql`
- `../nr-mof-db/scripts/THE/PROCEDURES/V7.02650__RTM_EMS_LOG_AMV_SELECT.sql`
- `../nr-mof-db/scripts/THE/PROCEDURES/V7.02651__RTM_EMS_LOG_AMV_UPDATE.sql`
- `../nr-mof-db/scripts/THE/GRANTS/V16.00571__RTM_EXP_LOGAMV_UPD.sql`
- `../nr-mof-db/scripts/THE/TRIGGERS/V11.00299__SYNC_EMSLA_EXPLA.sql`
- `../nr-mof-db/scripts/THE/TRIGGERS/V11.00355__TB1__EMS_LOG_AMV.sql`
- `../nr-rtm/src/main/webapp/manager/EMSLOGAMV/summary.jsp`
- `../nr-rtm/src/main/java/ca/bc/gov/mof/rtm/controller/EMSLOGAMVAction.java`
- `../nr-rtm/src/main/webapp/resources/help/EMS_LOG_AMVHelp.html`
