# RTM AMV UI And Persistence Contract

This note records the active RTM Average Monthly Values contract at
`/admin/rtm/emslogamv`. It aligns the page with the approved single-table workflow while
preserving the legacy `THE.EMS_LOG_AMV` schema and its downstream synchronization trigger.
The former workbook upload endpoints are not authorized and are not part of this workflow.

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

`SYNC_EMSLA_EXPLA` still propagates each successful table mutation to `EXPORT_LOG_AMV`, so existing
downstream consumers continue to receive the legacy physical rows.

## Legacy procedure boundary

`RTM_EMS_LOG_AMV_INSERT` and `RTM_EMS_LOG_AMV_UPDATE` are retained in the database for legacy
compatibility. Both issue `COMMIT`, which makes them unsuitable for the active multi-row UI save.
The UI does not expose a single-row or workbook mutation route. The read path can still use the
direct effective-date query because the legacy select procedure requires an exact species and
growth type.

The table has no user/timestamp audit columns. This change preserves the schema and trigger; it
does not claim to add audit metadata that the legacy data model cannot store.

## Outstanding legacy data decisions

The approved UI behavior is implemented against the existing data model. The following Confluence
requirements need a data-owner decision and an approved persistence design before they can be
implemented without changing legacy semantics:

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
