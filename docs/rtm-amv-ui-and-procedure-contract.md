# RTM AMV UI And Persistence Contract

This note records the active RTM Average Monthly Values contract. Administrators maintain values
through the workbook workflow at `/admin/rtm/emslogamv/upload`. The former editable-grid route is
not exposed while this workflow is under review. The active workflow preserves the legacy
`THE.EMS_LOG_AMV` value model and its downstream synchronization trigger, with four audit columns
added for LEXIS-managed writes.

## Logical AMV review

- The page shows one species tab at a time with exact previous-month and upcoming-month columns. It
  has no old-growth/second-growth control.
- The displayed value is the old-growth (`O`) baseline. When saved, the same value is written to
  both old growth (`O`) and second growth (`S`).
- User-facing copy intentionally describes one monthly value only; it does not expose the
  underlying growth-partition persistence behavior.
- The table columns are Balsam (`BA`), Hemlock (`HE`), Cedar (`CE`), Cypress (`CY`), Fir (`FI`),
  Spruce (`SP`), and one friendly Pine column.
- Spruce maps one-to-one to physical `SP`; it does not expand like Pine.
- Pine expands to all three legacy species codes: `WH`, `LO`, and `YE`.
- The review exposes grades `B` through `M`, `U`, `X`, and `Y`. It does not show `A`, `W`, `Z`, grades
  `1` through `6`, or the legacy blank-grade row.
- Fixed grades `Z`, `BLANK`, and `1` through `6` are saved automatically as `$1.00` for every
  species and are described in the review notice.

`THE.EMS_LOG_AMV` has no `blank` flag. Its value columns remain `SPECIES`, `GRADE`,
`GROWTH_TYPE_ST`, `EFFECTIVE_DATE`, `AVG_MARKET_PRICE`, and `REVISION_COUNT`; LEXIS adds
`ENTRY_USERID`, `ENTRY_TIMESTAMP`, `UPDATE_USERID`, and `UPDATE_TIMESTAMP` solely as audit metadata.
The UI therefore does not invent or submit a `blank = 1` field.

### Clarified legacy `BLANK` semantics

The legacy `BLANK` label is a display alias for a space-valued `GRADE` (`' '`) row. It is not a
column or a flag. The legacy UI submitted that row as `GRADE = ' '`, the select procedure returned
it as `BLANK`, and the table trigger normalizes an omitted or trimmed grade to a space. The active
UI intentionally hides that row and maintains it automatically at `$1.00`; it does not replace it
with a new `blank = 1` attribute.

Likewise, legacy `UPDATE_DATE` is a user-entered effective month. It is not the timestamp of the
last submission: the legacy update procedure uses a later value to create a new effective-dated
version and an equal value to update the current one. The active UI supplies the effective month
only and does not misrepresent it as audit metadata.

## Dates and values

- The UI derives the immediately upcoming month and always submits its first calendar day.
- The API also normalizes a supported `YYYY-MM-DD` input to that month's first day before it
  queries or saves a value. It does not retain a time-of-day component.
- Retrieval dates are implementation data and are not shown or editable in the UI.
- A value must be numeric, non-negative, at most `9999.99`, and have at most two decimal places.
- The only editable effective month is the immediately upcoming calendar month. Its values can be
  edited and saved as many times as needed until it becomes the current month.
- Current and previous months are never editable. At month rollover, the page advances to the new
  immediately upcoming month and loads that month's saved rows when they exist; otherwise it
  returns to the empty upload state.
- The review compares the upcoming values only with rows from the immediately previous calendar
  month. It does not fall back to an older row when that month has no row for a species and grade.
  This is a month-to-month reconciliation view, not a claim about the value currently in effect.
- Downstream permit-fee calculation remains effective-dated and mirrors legacy: it selects the
  latest `EXPORT_LOG_AMV` date on or before the permit application date for the matching species
  and grade, then applies the applicable growth type at that date. Growth type is deliberately not
  part of the maximum-date selection. An older value can therefore remain effective downstream
  while the exact previous-month review cell is empty.
- Values cannot be cleared: `AVG_MARKET_PRICE` is `NOT NULL` and the approved RTM contract has no
  delete operation.
- A blank upcoming value is omitted from the batch. When the current month had a value, the blank
  cell receives an advisory warning and the user can enter `0` to persist an explicit zero.
- A positive value for a species/grade combination that had no exact previous-month value also
  receives an advisory warning. Entering `0` records none and resolves that warning. Both advisory
  cases may be saved without correction.

## Atomic reviewed saves

The active page calls `POST /api/lexis/rtm/emslogamv/batch` once per Save action. The body is a
`values` array containing all nonblank reviewed logical cells plus the fixed `$1.00` grades. The
backend independently rejects a batch whose effective date is not the immediately upcoming
month. The prior single-row `POST /emslogamv` route is not exposed, so the page cannot bypass the
atomic batch contract.

The backend validates the complete request before any write, then expands each logical cell to its
physical targets:

- Every non-Pine cell becomes two writes: its species for `O` and `S`.
- Every Pine cell becomes six writes: `WH`, `LO`, and `YE`, each for `O` and `S`.

The Oracle implementation performs those writes with direct `MERGE` statements inside one Spring
transaction. A new row receives the authenticated actor and `SYSDATE` in both the
`ENTRY_USERID`/`ENTRY_TIMESTAMP` and `UPDATE_USERID`/`UPDATE_TIMESTAMP` pairs; a matched row changes
only the update pair. The identity is resolved by `LexisPrincipalService`, limited to the shared
30-byte audit convention, and never accepted from the request body. The implementation requires
the deployed LEXIS database user to have direct
`INSERT` and `UPDATE` access to `THE.EMS_LOG_AMV`; it does not call the legacy row procedures
because they commit internally. If any write fails or is not applied, the transaction is rolled
back. An incomplete batch is reported as rejected; a database failure uses the API's normal
service-unavailable response. A successful response is therefore the confirmation that the
complete reviewed submission was accepted.

## Workbook preview and save

The active page retains the XLSX template, validation, preview, and species review flow. Preview
calls `POST /api/lexis/rtm/emslogamv/preview`; the reviewed values are then submitted through the
atomic batch endpoint. These routes require `/lexisAgentAdmin`, including when the application
runs in PROD RTM-only mode. The older direct `/upload` endpoint remains for compatibility but is
not called by this page because it would re-read the original workbook and discard review edits.
If it is called, it resolves and persists the authenticated actor through the same audit-aware
`MERGE` implementation.

The backend scans the workbook for malware, validates its shape, dates, dimensions, and values,
uses the page's fixed upcoming effective month, and returns the union of the exact previous-month
and uploaded logical cells. This union allows the client to show both missing-upcoming and
new-combination warnings. Final submission expands the reviewed values to direct `MERGE` targets
and writes them in one Spring transaction. It does not call the legacy row procedures. If any
target is not applied or the database write fails, the complete batch transaction rolls back.

After an accepted save, the page removes the upload card, shows the saved confirmation in the
fixed top-right toast region, and keeps the reviewed values editable. The confirmation does not
change the user's scroll position. While a save is pending, the Save values button shows a spinner
and changes its label to Saving values. Replace file first
reveals a warning and the upload area together in one card above the unchanged saved review;
opening it does not select a file or change any values.
Keep current values closes that temporary state. An accepted replacement removes the warning,
shows the selected filename, and previews the workbook over the values on screen without changing
the database. A rejected replacement remains visible in the upload area and leaves the review
intact; Cancel restores the last-saved preview, while Save values applies the replacement through
the same batch update used for manual edits. Removing a replacement file restores the review from
before that file was selected; if a file-derived value was then edited by hand, removal first shows
the confirmation because re-uploading cannot recover that edit. The expanded replacement area is
browser-only state, so refresh returns to the compact saved review. Save and Cancel remain
keyboard-focusable but are announced as unavailable until a value changes or a replacement
workbook has been accepted; the helper text is linked through `aria-describedby`. Editing a value
clears the saved confirmation. Cancel then offers to save the changes or return the table to the
last saved values; Discard changes uses the danger-tertiary style. Restoring the saved values shows
a dismissible confirmation that also clears on the next edit.
Confirmation dialogs return focus to the action that opened them. The page header does not show
save time or user until the upcoming month has saved rows and complete audit metadata. After an
accepted save, and again on navigation or refresh, the page queries the immediately upcoming
effective month. It displays `Last saved` using the newest `UPDATE_TIMESTAMP` for that month, with
`ENTRY_TIMESTAMP` as the fallback for legacy rows without update audit data, together with the matching
user. This is the last durable audit value for the effective month being edited, not the effective
date itself.

The page restores the editable review and exact previous-month comparison when upcoming-month rows
exist; otherwise it restores the upload state and omits `Last saved`. The workbook and filename
are not persisted, so neither is shown after a save or in a restored review. The saved-row lookup
gates the initial workflow render: neither upload nor review is shown while it is pending. The
application shell remains visible around a centered, non-overlay Carbon loading indicator,
matching the initial-data gate in NR-FSPTS. A failed lookup shows an error instead of assuming
there are no saved values.

## Batch audit event

After the controller resolves a batch outcome, it writes one structured
`event=lexis_rtm_amv_batch` application audit event. It records the authenticated
`LexisPrincipalService` identity, a server-generated timestamp, the HTTP status and service
outcome, requested logical-cell count, and written physical-row count. Accepted, rejected,
identity-rejected, and unexpected database outcomes are all recorded. The request has no actor
field, so no client-supplied identity is logged or trusted. If a stable identity cannot be
resolved, the controller logs `identity_rejected`, returns `403 Forbidden`, and does not invoke
the service.

The application event remains an operational summary. Durable row audit is stored directly on
`EMS_LOG_AMV`: creates populate both `ENTRY_USERID`/`ENTRY_TIMESTAMP` and
`UPDATE_USERID`/`UPDATE_TIMESTAMP`, while subsequent writes change only the update pair. The
application event and row columns serve different purposes
and neither trusts a client-supplied actor.

`SYNC_EMSLA_EXPLA` remains the configured mechanism that mirrors successful table mutations to
`EXPORT_LOG_AMV`. Source review confirms that the modern permit-fee query preserves the legacy
effective-month, species, grade, and post-date growth filter. Live TEST verification is still
required before claiming that every report, integration, and query is unaffected.

## Legacy procedure boundary

The legacy RTM screen converted its user-entered retrieval `CCYYMM` to the first day of that month,
and `RTM_EMS_LOG_AMV_SELECT` required `EFFECTIVE_DATE = V_RETRIEVAL_DATE`. The active workflow
preserves that exact-month comparison while supplying the immediately previous month automatically.

`RTM_EMS_LOG_AMV_INSERT` and `RTM_EMS_LOG_AMV_UPDATE` are retained in the database for legacy
compatibility. Both issue `COMMIT`, which makes them unsuitable for either active multi-row save.
The reviewed batch and compatibility workbook upload therefore use the same direct transactional
`MERGE` implementation; no single-row mutation route is exposed. The read path can still use the
direct effective-date query because the legacy select procedure requires an exact species and
growth type.

The audit-column database migration must be deployed before this application version. The legacy
procedures remain unchanged and do not populate the new fields. The columns remain nullable so
existing rows are not assigned fabricated audit history; durable audit and the `Last saved`
display apply to LEXIS-owned batch and compatibility workbook writes moving forward.

## Confluence requirement traceability

| Requirement     | Current status             | Evidence or decision needed                                                                                                                         |
| --------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-01           | Implemented                | The existing schema represents the required old-growth and second-growth values as `O` and `S` partitions in one physical table.                    |
| FR-02 to FR-04  | Implemented                | One user save fans out identical values to `O` and `S` without exposing either choice in the UI.                                                    |
| FR-05 to FR-06  | Implemented                | Friendly species labels are mapped by the service; Pine expands to `WH`, `LO`, and `YE` for both growth partitions.                                 |
| FR-07 to FR-10  | Implemented                | The UI/API normalize to a `LocalDate` month start and do not expose retrieval date input.                                                           |
| FR-11           | Implemented                | LEXIS writes durable create/update users and timestamps; legacy `UPDATE_DATE` remains an effective month rather than audit metadata.                 |
| FR-12 and FR-14 | Confluence correction needed | `BLANK` is the legacy display alias for `GRADE = ' '`; the physical table has no blank flag/column to set to `1`.                                  |
| FR-13           | Implemented                | No blank flag is rendered or accepted from the UI.                                                                                                  |
| FR-15           | Implemented                | The editable grade set is `B` through `M`, `U`, `X`, and `Y`; retired grade `A` is hidden along with `W` and the fixed grades. Fixed grades are submitted automatically at `$1.00`. |
| FR-16           | Implemented                | A blank upcoming value is omitted and remains an advisory warning when the current month had a value; entering `0` persists an explicit zero.       |
| FR-17           | Implemented                | Reviewed batches validate before direct `MERGE` writes inside one transaction.                                                                      |
| FR-18           | Implemented                | Stable authenticated identities and Oracle timestamps are persisted per row, with a structured application event summarizing each batch outcome.    |
| FR-19 to FR-20  | Implemented                | Numeric non-negative validation occurs before save; accepted and rejected batch outcomes are returned to the user.                                  |
| FR-21           | Source parity reviewed; live verification required | The trigger mirrors to `EXPORT_LOG_AMV`; modern permit-fee lookup preserves the legacy effective-date and dimension ordering, while broader TEST/downstream validation remains. |

## Legacy schema constraints

The implemented UI behavior is constrained by the existing data model:

- Legacy RTM allowed a user to enter one physical growth partition at a time. The active logical
  review intentionally applies the Confluence O/S fan-out rule instead; no physical-table change
  is required because `EMS_LOG_AMV` stores the partitions through `GROWTH_TYPE_ST`.
- `BLANK` is a legacy grade sentinel (`GRADE = ' '`), not a column. The Confluence `blank = 1`
  wording needs correction before a new flag or column is considered.
- The approved audit-column migration adds create/update identity and timestamp fields without
  changing the effective-dated value key or the existing downstream synchronization trigger.
- `AVG_MARKET_PRICE` is `NOT NULL`; legacy code treats an empty value as a no-op. The active UI
  preserves that behavior by omitting blank reviewed values from the batch. Product confirmation
  is still needed if a delete behavior is desired instead.

No trigger or downstream consumer behavior is inferred or altered by this application branch.

## Sources reviewed

- `../nr-mof-db/scripts/THE/TABLES/V2.00906__EMS_LOG_AMV.sql`
- `../nr-mof-db/scripts/THE/TABLES/V999999999999.1__EMS_LOG_AMV_AUDIT_COLUMNS.sql`
- `../nr-mof-db/scripts/THE/PROCEDURES/V7.02649__RTM_EMS_LOG_AMV_INSERT.sql`
- `../nr-mof-db/scripts/THE/PROCEDURES/V7.02650__RTM_EMS_LOG_AMV_SELECT.sql`
- `../nr-mof-db/scripts/THE/PROCEDURES/V7.02651__RTM_EMS_LOG_AMV_UPDATE.sql`
- `../nr-mof-db/scripts/THE/GRANTS/V16.00571__RTM_EXP_LOGAMV_UPD.sql`
- `../nr-mof-db/scripts/THE/TRIGGERS/V11.00299__SYNC_EMSLA_EXPLA.sql`
- `../nr-mof-db/scripts/THE/TRIGGERS/V11.00355__TB1__EMS_LOG_AMV.sql`
- `../nr-rtm/src/main/webapp/manager/EMSLOGAMV/summary.jsp`
- `../nr-rtm/src/main/java/ca/bc/gov/mof/rtm/controller/EMSLOGAMVAction.java`
- `../nr-rtm/src/main/webapp/resources/help/EMS_LOG_AMVHelp.html`
- `../nr-lexis-main/src/main/java/ca/bc/gov/mof/lexis/dao/oracle/OracleLogAmvDAO.java`
- `../nr-mof-db/scripts/THE/PACKAGE_BODIES/V9.00386__LEXIS.sql`
- `backend/src/main/java/ca/bc/gov/mof/lexis/repository/permit/PermitRpcRepository.java`
