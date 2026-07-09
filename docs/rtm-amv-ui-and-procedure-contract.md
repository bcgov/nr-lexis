# RTM AMV UI And Procedure Contract

This note records the database contract and intentional UI limits for the RTM Average Monthly
Values table. It is for product, support, and engineering conversations; it is not a replacement
for the Oracle procedure source.

The current active UI is the editable table at `/admin/rtm/emslogamv`. The former workbook upload
workflow is retained as dormant code and is not part of the active process.

## Effective-Dated Data Model

`THE.EMS_LOG_AMV` is keyed by growth type, grade, species, and effective date. The AMV price is
`NUMBER(6,2) NOT NULL`.

Consequences for the UI:

- A saved amount must be from `0` through `9999.99` with at most two decimal places.
- A blank current-date cell means there is no physical AMV row for that date. The table displays it
  as `-`; entering a number creates the required row or rows.
- A persisted amount cannot be cleared through the current RTM contract. There is no nullable
  amount and no supported RTM delete operation.
- Pine is a display grouping only. A Pine edit is persisted as `WH`, `LO`, and `YE`, each for old
  and second growth.

## Daily UI Rules

- Today is editable and is compared with yesterday.
- Yesterday and all earlier dates are editable after an explicit confirmation. The table shows a
  warning panel before a backdated change can be saved.
- When any selected date has no rows, the UI copies values from the latest earlier populated date as
  an unsaved starting point. This applies to gaps before today as well as today and future dates.
- Future dates are editable but do not receive daily carry-forward warnings.
- When yesterday has a value and today is blank, the table warns that the value is missing.
- When yesterday is blank and a user enters a value today, the table warns and requires an explicit
  confirmation before saving. The warning does not block the confirmed save.

Warnings are deliberately advisory. They do not change the effective date or fabricate an AMV
value.

## Procedure Behavior That Shapes The UI

### `RTM_EMS_LOG_AMV_SELECT`

The legacy select procedure requires an exact species and growth type; it is not a wildcard table
query. The active table therefore loads effective-date rows directly for its all-species/all-growth
view, while exact legacy lookups continue to use the procedure.

### `RTM_EMS_LOG_AMV_INSERT`

Insert uppercases species, grade, and growth type, sets `REVISION_COUNT` to `0`, returns `-100` on
success, and commits inside the procedure.

### `RTM_EMS_LOG_AMV_UPDATE`

- A target date after the retrieval date delegates to insert, creating an effective-dated row.
- Equal retrieval and target dates update an existing row, or insert when the procedure finds no
  row.
- The procedure's existence count does not include growth type, while its update predicate does.
  The GUI therefore determines create versus update per physical species/growth target and confirms
  the saved table value after a successful return code.
- The backend rejects a target date before its retrieval date instead of relying on the procedure's
  undefined return behavior for that case.

Each insert/update commits internally. A Spring transaction cannot roll back a prior successful
old-growth, second-growth, or Pine-code mutation.

## Save And Retry Behavior

A table cell can fan out to two physical rows, or six rows for Pine. The UI treats those as
independent procedure calls because the database contract does the same.

When some calls succeed and others fail, the UI reloads the selected date from Oracle and keeps the
failed cell ready for retry. This avoids showing a stale all-or-nothing result. It is recovery, not
database atomicity.

The regression test for AMV validation intercepts every AMV request and returns a validation
failure. It verifies the table's failure behavior without writing weekly AMV values into TEST.

## Deletion Boundary

The RTM grant migration grants `RTM_EXP_LOGAMV_UPD` `INSERT`, `SELECT`, and `UPDATE` on
`EMS_LOG_AMV`, plus execute on the insert/select/update procedures. It does not grant `DELETE`,
and the RTM procedure set has no delete procedure.

Do not add direct-table deletion from LEXIS to work around this. `SYNC_EMSLA_EXPLA` synchronizes
inserts, updates, and deletes to `EXPORT_LOG_AMV`; a future delete workflow needs an explicit
database contract, execution grant, authorization rule, and regression coverage.

To support removal of a persisted AMV value, the database team would need to provide and approve a
delete procedure or equivalent business operation. To support atomic Pine/old/second-growth saves,
the database would need a batch operation that does not commit each individual row.

## Sources Reviewed

- `../nr-mof-db/scripts/THE/TABLES/V2.00906__EMS_LOG_AMV.sql`
- `../nr-mof-db/scripts/THE/PROCEDURES/V7.02649__RTM_EMS_LOG_AMV_INSERT.sql`
- `../nr-mof-db/scripts/THE/PROCEDURES/V7.02650__RTM_EMS_LOG_AMV_SELECT.sql`
- `../nr-mof-db/scripts/THE/PROCEDURES/V7.02651__RTM_EMS_LOG_AMV_UPDATE.sql`
- `../nr-mof-db/scripts/THE/GRANTS/V16.00571__RTM_EXP_LOGAMV_UPD.sql`
- `../nr-mof-db/scripts/THE/TRIGGERS/V11.00299__SYNC_EMSLA_EXPLA.sql`

The same insert, select, and update procedure definitions were supplied from TEST during the AMV
GUI work in July 2026.
