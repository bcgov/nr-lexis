# LEXIS bug register

Defects affecting the legacy lift-and-shift, including completed corrections and outstanding work.
`LEGACY` identifies inherited defects; `PARITY` identifies modern gaps in supported legacy workflows.
Clear application-code bugs may be corrected using the best supported assumption, recorded with the item.
Business-approved feature changes remain in [intentional legacy divergences](intentional-legacy-divergences.md).

**Working scope:** prioritize major defects and corrections within the modern application. Shared
Oracle procedure findings are proposals for business approval, not implementation work for this
lift-and-shift. Leave `nr-mof-db` untouched unless a separately approved change is explicitly assigned.
The completed, business-confirmed scale-duplication correction in LEGACY-004 is a specific exception;
it does not authorize further procedure changes.

**Status:** Open = correction needed; Fix prepared = local change awaiting release; Implemented =
correction in modern `main`; Acceptance pending = implemented with specific live checks outstanding;
Awaiting business approval = documented proposal outside the current implementation scope;
Resolved = deployed correction accepted. Deployment or acceptance details are included where known.

## Register

| ID                                                                                              | Issue                                                         | Status                                                    |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| [LEGACY-001](#legacy-001--package-update-dereferences-a-missing-exemption-type)                 | Package update crashes without a linked exemption             | Handled in modern; legacy failure explanation provisional |
| [LEGACY-002](#legacy-002--package-update-uses-display-text-as-the-stored-identity)              | Padded package update can target its plain sibling            | Acceptance pending: offers and permit availability        |
| [LEGACY-003](#legacy-003--ordinary-legacy-package-dialogs-omit-classification)                  | Missing package age blocks an ordinary comment edit           | Fix prepared: modern Items default                        |
| [LEGACY-004](#legacy-004--timber-mark-joins-duplicate-scale-rows-and-inflate-totals)            | Timber-mark joins duplicate scale rows and totals             | Resolved: PROD display accepted                           |
| [LEGACY-005](#legacy-005--client-contact-details-come-from-the-default-location)                | Saved location and displayed contact details disagree         | Implemented; historical TEST check passed                 |
| [LEGACY-006](#legacy-006--valid-shipping-countries-render-blank)                                | Valid saved shipping countries render blank                   | Implemented                                               |
| [LEGACY-007](#legacy-007--impossible-calendar-dates-are-accepted-or-normalized)                 | Impossible dates are accepted or changed during parsing       | Implemented                                               |
| [LEGACY-008](#legacy-008--invoice-identifiers-can-exceed-the-database-character-set)            | Invoice identifiers exceed the supported character set        | Implemented                                               |
| [LEGACY-009](#legacy-009--a-positive-fee-override-rounds-to-zero)                               | Positive fee override becomes disabled after rounding         | Implemented                                               |
| [LEGACY-010](#legacy-010--search-joins-duplicate-records-counts-and-balances)                   | Search joins duplicate results, counts and balances           | Implemented                                               |
| [LEGACY-011](#legacy-011--application-save-depends-on-omitted-staff-controls)                   | Submitter save depends on absent staff controls               | Implemented                                               |
| [LEGACY-012](#legacy-012--permit-ledger-omits-the-other-species-code)                           | Permit Ledger and Species/Grade omit Other species volume     | Awaiting business approval: Oracle                        |
| [LEGACY-013](#legacy-013--speciesgrade-csv-checks-the-wrong-date-parameter)                     | Species/Grade mishandles one-sided date ranges                | Awaiting business approval: Oracle                        |
| [LEGACY-014](#legacy-014--speciesgrade-ignores-the-exemption-type-filter)                       | Species/Grade ignores exemption type                          | Awaiting business approval: Oracle                        |
| [LEGACY-015](#legacy-015--speciesgrade-ignores-the-forest-file-filter)                          | Species/Grade ignores Forest file ID                          | Awaiting business approval: Oracle                        |
| [LEGACY-016](#legacy-016--speciesgrade-multiplies-scales-by-linked-applications)                | Species/Grade counts a scale once per linked application      | Awaiting business approval: Oracle                        |
| [PARITY-001](#parity-001--speciesgrade-report-parameters-were-bound-in-the-wrong-order)         | Species/Grade criteria reach the wrong parameters             | Implemented                                               |
| [PARITY-002](#parity-002--a-stored-zero-override-blocked-unrelated-permit-edits)                | Stored zero override blocks unrelated permit edits            | Implemented; DEV-174 check against TEST passed            |
| [PARITY-003](#parity-003--boic-package-classification-and-current-volume-used-the-wrong-values) | BOIC classification and current volume use wrong values       | Implemented; DEV-174 check against TEST passed            |
| [PARITY-004](#parity-004--approved-applications-could-not-receive-supported-review-transitions) | Approved applications cannot receive supported review changes | Implemented                                               |
| [PARITY-005](#parity-005--permit-totals-stay-stale-after-scale-changes)                         | Permit totals stay stale after scale changes                  | Implemented                                               |
| [PARITY-006](#parity-006--offer-eligibility-and-dates-use-cached-application-state)             | Offer eligibility and dates use cached application state      | Implemented                                               |
| [PARITY-007](#parity-007--cleared-report-dates-are-replaced-or-rejected)                        | Cleared report dates are replaced or rejected                 | Implemented                                               |
| [PARITY-008](#parity-008--permit-summary-omits-associated-applications-and-packages)            | Permit summary omits associated applications and packages     | Implemented                                               |
| [PARITY-009](#parity-009--tenure-report-variants-share-unrelated-filters)                       | Tenure report variants share unrelated filters                | Implemented                                               |

## Oracle proposals awaiting business approval

All routines below belong to `THE.LEXIS_REPORTING`. These findings are retained for a business
decision on impact, report usage and whether to authorize a procedure correction. Prioritize that
decision where incorrect volumes or totals materially affect operations; the register does not assume
every report defect warrants database work or blocks the current application release.

| Procedure                     | Proposed correction                                                                                                        | Business decision          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `PERMIT_LEDGER_REPORT`        | Include `OT` in Other — LEGACY-012                                                                                         | Awaiting approval          |
| `SPECIES_GRADE_REPORT_CSV`    | Correct end-date guard; apply exemption type and Forest file filters; count each scale once; include `OT` — LEGACY-012–016 | Awaiting approval          |
| `SPECIES_GRADE_RPT`           | Apply Forest file filter; count each scale once; include `OT` — LEGACY-012, 015, 016                                       | Awaiting approval          |
| `SPECIES_GRADE_REGION_SUBRPT` | Apply Forest file filter; count each scale once; include `OT` — LEGACY-012, 015, 016                                       | Awaiting approval          |

Previously recorded database draft `982f3140` on `fix/lexis-reporting-safe-db-fixes` covers only the
Permit Ledger Other subtotal and CSV end-date guard. That unmerged draft is on hold; it is not approved
for release and is not being extended, reverted or otherwise changed as part of this work.

Modern Species/Grade PDF and CSV both use `SPECIES_GRADE_REPORT_CSV`. If a correction is separately
approved and assigned, reconcile it with the deployed package body, compile in Oracle and verify
report criteria and scale totals before closure. Use existing records or supported UI-created data.

## LEGACY-001 — Package update dereferences a missing exemption type

An ordinary application can contain packages before it has an exemption. Legacy
`ApplicationDetailsRPCAction.updatePackage` calls `getExportExemptionTypeCode().equals(...)`
on that nullable value before persistence. Package creation can therefore succeed while a subsequent
comment update fails. This explains the observed failure plausibly; the exact live exception remains
unconfirmed without legacy logs.

Modern allows an otherwise valid package update without a linked exemption. Retain that behavior
and the existing ownership, status and lock checks. No Oracle procedure change is needed for this
null dereference, and no legacy application patch is prepared. Missing classification is handled
separately in LEGACY-003.

## LEGACY-002 — Package update uses display text as the stored identity

Legacy permits distinct package numbers differing only by trailing whitespace. Ordinary `items_tab.js`
and BOIC `boicItemsTab.js` use an option's display `.text` as the update target; that representation
can lose the space retained by its raw value. Selecting the padded package can target the plain sibling.

[PR #228](https://github.com/bcgov/nr-lexis/pull/228) preserves the exact stored key through modern
selection, reads and writes, with readable labels to distinguish padding. Tests cover sibling targeting,
volume exclusion and scale association. A single padded-key edit and restoration passed in TEST,
including Oracle readback.

Same-application BOIC siblings created through legacy UI also passed modern TEST checks: padded
comment edit/restoration, combined package-volume validation, separate scale additions and fee rows,
scale removal, and padded-package deletion while preserving the plain sibling and its scale. Fresh
legacy reads confirmed the saved values; final cleanup retained the plain package with zero scales.
BOIC scale maintenance uses the supported add/remove workflow; neither UI exposes direct scale editing.

**Remaining:** offer creation and permit-availability exclusion with eligible UI-created records.
The retained ordinary sibling fixture has a future listing date; recheck eligibility when its offer
window opens. These acceptance checks do not justify bypassing eligibility or adding a new workflow.

## LEGACY-003 — Ordinary legacy package dialogs omit classification

Legacy's ordinary Add Package dialog omits package product type and age class, and Oracle permits
both to be null. Modern already inherited a missing product type from the application, but an absent
package age blocked even a comment-only save.

**Assumption used:** a missing package age may inherit the saved application age when the application
is explicitly non-OIC and the effective package product matches the application's product. Explicit
package values remain authoritative. Unknown/OIC context, missing application age and product
mismatches retain validation. This follows legacy's ordinary classification intent without inventing
classification for BOIC packages.

Local fix `edb1d73b` displays the inherited value and sends it only when the user saves. New-package
requirements remain unchanged. [Items regression coverage](../frontend/src/pages/__tests__/ProvincialApplicationDetailItems.test.tsx)
protects the fallback, exclusions and exact sibling key. **Remaining:** release and verify a save/readback
through the deployed UI.

## LEGACY-004 — Timber-mark joins duplicate scale rows and inflate totals

Joining a scale through multiple harvesting-authority relationships repeated the same saved scale,
inflating displayed pieces, volume and fee inputs. Timber-mark punctuation was not the cause.
The correction joins directly to the unique `TIMBER_MARK` row and reads its `CASCADE_SPLIT_CODE`.

Shared database [PR #735](https://github.com/bcgov-c/nr-mof-db/pull/735), commit `6bac178b9`, corrects
five `THE.LEXIS` cursors: `FIND_SCALE_DETAIL_BY_ID`, `FIND_SCALE_DETAIL_BY_APP`,
`FIND_SCALE_DETAIL_BY_PKG`, `FIND_SCALE_DETAIL_BY_PRM`, and the `INSERT_SCALE_DETAIL` return cursor.
Modern [PR #214](https://github.com/bcgov/nr-lexis/pull/214) corrects the direct scale and fee queries;
[repository tests](../backend/src/test/java/ca/bc/gov/mof/lexis/repository/permit/PermitRpcRepositoryTest.java)
protect those joins.

On 1 September 2026, legacy and modern TEST changed from three displayed copies of one scale
(36 pieces, 9 m³) to one row (12 pieces, 3 m³). Supplied business correspondence reports the database
fix deployed to PROD on 3 September and confirms the corrected display. No historical fee or data
backfill is included.

## LEGACY-005 — Client contact details come from the default location

Legacy exemption `agent-owner_tab.js.getClientInfo` fetches location `00` contact details before
selecting the saved location. The selector can show the correct location while the address, phone
and email belong to another one.

Modern [client lookup](../frontend/src/service/application-client-lookup-service.ts) uses the saved
client number and location together. [Commit dd2029fb](https://github.com/bcgov/nr-lexis/commit/dd2029fb)
records this existing correction as `AUTHORITATIVE_CLIENT_LOCATION_LOOKUP`. Historical TEST
comparison confirmed it; [client parity tests](../frontend/src/pages/__tests__/ProvincialExemptionClientParity.test.tsx)
protect the requested location. No Oracle change is required.

## LEGACY-006 — Valid shipping countries render blank

Legacy initializes shipping selectors with a short country list. A valid saved country outside that
list, such as `AD`/Andorra, can appear blank. Modern loads all active countries through
`FIND_ALL_COUNTRY_CODES`, preserving the saved value.

The lookup was introduced in [e774917d](https://github.com/bcgov/nr-lexis/commit/e774917d).
[Commit 1e69dcbe](https://github.com/bcgov/nr-lexis/commit/1e69dcbe) records
`COMPLETE_SHIPPING_COUNTRY_OPTIONS` and adds the Andorra assertion.
[Shipping reference tests](../frontend/src/service/__tests__/shipping-reference-service.test.ts)
cover labels and stored-code fallback. No Oracle change is required.

## LEGACY-007 — Impossible calendar dates are accepted or normalized

Legacy `LexisFormatUtils.parseDisplayDate` combines a date-shaped pattern with lenient parsing.
An impossible date such as 30 February can become a different persisted date.

Modern rejects impossible dates and retains invalid typed text for correction, including after blur.
The fixes span [214c665d](https://github.com/bcgov/nr-lexis/commit/214c665d),
[41471c7e](https://github.com/bcgov/nr-lexis/commit/41471c7e),
[33ad2347](https://github.com/bcgov/nr-lexis/commit/33ad2347) and strict backend parsing in
[905cdb3d](https://github.com/bcgov/nr-lexis/commit/905cdb3d).
[Date picker tests](../frontend/src/components/__tests__/IsoDatePicker.test.tsx) and
[backend date tests](../backend/src/test/java/ca/bc/gov/mof/lexis/util/DateUtilsTest.java)
cover invalid dates and leap days. Existing stored dates are not rewritten.

## LEGACY-008 — Invoice identifiers can exceed the database character set

Legacy invoice validation checks presence and length but lacks the character guard required by the
`US7ASCII` `VARCHAR2(9 BYTE)` storage contract. An identifier may pass entry validation yet contain
characters Oracle cannot represent.

[Commit 8d8bff03](https://github.com/bcgov/nr-lexis/commit/8d8bff03) adds shared printable US-ASCII
validation to modern invoice entry and upload, preserving supported punctuation and the nine-character
limit. [InvoiceStorageConstraints](../backend/src/main/java/ca/bc/gov/mof/lexis/util/InvoiceStorageConstraints.java)
and [UI tests](../frontend/src/pages/shared/__tests__/invoice-storage-validation.test.ts) capture the rule.
No schema change or historical invoice repair is required by this correction.

## LEGACY-009 — A positive fee override rounds to zero

Legacy accepts an enabled override greater than zero, but a value such as `0.001` rounds to `0.00`
in storage. The saved permit then treats that override as disabled.

[Commit 54e7fb47](https://github.com/bcgov/nr-lexis/commit/54e7fb47) requires an enabled override to
remain positive after the existing two-decimal rounding. [Validator tests](../backend/src/test/java/ca/bc/gov/mof/lexis/service/permit/ProvincialPermitMutationValidatorTest.java)
reject `0.001` and accept `0.005` as `0.01`. Fee calculation and Oracle rounding are unchanged.
PARITY-002 separately handles existing stored zero values during unrelated edits.

## LEGACY-010 — Search joins duplicate records, counts and balances

Multiple linked applications or access relationships can multiply legacy exemption/permit search rows,
counts and volume balances. These are search-query defects, separate from the scale display issue in
LEGACY-004 and report aggregation in LEGACY-016.

[Commit 15501690](https://github.com/bcgov/nr-lexis/commit/15501690) gives modern search one
application representative per exemption, separately aggregated permit volumes and deduplicated
accessible permits. [Commit b67776f0](https://github.com/bcgov/nr-lexis/commit/b67776f0) adds
page/count protections in [exemption](../backend/src/test/java/ca/bc/gov/mof/lexis/repository/exemption/ExemptionRepositoryTest.java)
and [permit](../backend/src/test/java/ca/bc/gov/mof/lexis/repository/permit/PermitRepositoryTest.java)
query tests. Ownership filters remain enforced; no shared procedure change is needed for these modern paths.

## LEGACY-011 — Application save depends on omitted staff controls

Legacy application `persistence.js.updateApplication` unconditionally reads status and additional-remarks
controls that `reviewTab.jsp` omits for users without staff review permission. A submitter's authorized
save can fail before reaching the server.

Modern constructs the update from authorized edit state without requiring those controls.
[Commit 27fb49f8](https://github.com/bcgov/nr-lexis/commit/27fb49f8) records the existing correction
as `BCEID_APPLICATION_EDIT_CONTRACT`. [Application action tests](../frontend/src/pages/__tests__/ProvincialApplicationDetailActions.test.tsx)
cover a scoped submitter saving while staff status is absent. This preserves editing without granting
review permission; no Oracle change is required.

## LEGACY-012 — Permit Ledger omits the Other species code

`PERMIT_LEDGER_REPORT` totals Other using `LA`, `WB`, `WH`, `YE` and `UU`, omitting the explicit
`OT` species code. `SPECIES_GRADE_RPT`, `SPECIES_GRADE_REPORT_CSV` and
`SPECIES_GRADE_REGION_SUBRPT` have the same omission. An `OT` scale can contribute zero to Other
instead of its saved volume.

**Proposed correction:** include `OT` in the existing Other group in all four routines. The earlier
Permit Ledger draft is on hold. **Business approval needed:** confirm that affected report usage and
missing `OT` volume warrant the change. If approved, acceptance must compare PDF, CSV and region
subtotals with saved `OT` volume. No change to saved species codes is proposed.

## LEGACY-013 — Species/Grade CSV checks the wrong date parameter

`SPECIES_GRADE_REPORT_CSV` assigns its upper bound from `P_DATE_TO` only when `P_DATE_FROM`
is present. An end-only filter is ignored; a start-only filter sets the upper bound to null and excludes
rows. Modern exposes both optional bounds and uses this procedure for PDF as well as CSV.

**Proposed correction:** guard the assignment with `P_DATE_TO`; the earlier draft is on hold.
**Business approval needed:** confirm whether one-sided date searches warrant a procedure change.
If approved, acceptance must cover no dates, start only, end only and both dates in Oracle and the
modern report UI. The old PDF routine already has the correct guard.

## LEGACY-014 — Species/Grade ignores the exemption-type filter

Legacy and modern send the selected exemption type, but `SPECIES_GRADE_REPORT_CSV` leaves
`V_EXEMPTION_TYPE` at `%`. Its query therefore returns other exemption types despite the selection.
The old PDF routine assigns the parameter correctly; modern PDF uses the affected CSV routine.

**Proposed correction:** copy the existing non-null parameter assignment into the CSV routine,
retaining `%` for an unfiltered request. No Java binding or procedure signature change is needed.
**Business approval needed:** confirm the reporting impact and authorize the filter correction.
If approved, acceptance must compare unfiltered and each supported type in PDF/CSV.

## LEGACY-015 — Species/Grade ignores the Forest file filter

The supported Forest file ID criterion is passed to Oracle but unused by the queries in
`SPECIES_GRADE_REPORT_CSV`, `SPECIES_GRADE_RPT` and `SPECIES_GRADE_REGION_SUBRPT`.
Selecting a nonmatching file can leave the result unchanged.

**Proposed correction:** apply the filter in all three routines. The legacy DAO maps it to
`HA.FOREST_FILE_ID`; the best supported approach is a correlated `EXISTS` lookup from the scale's
timber mark to the matching hauling-authority file, avoiding a join that multiplies scales.
**Business approval needed:** confirm report usage, the authoritative relationship and matching
semantics. If approved, acceptance must cover matching/nonmatching/absent criteria, multiple authority
matches and the separate Timber mark filter.

## LEGACY-016 — Species/Grade multiplies scales by linked applications

The three Species/Grade routines join permit scales to applications by exemption number, then sum
volume. With multiple applications under one exemption, each scale can contribute repeatedly or use
another application's classification. A local relational reproduction changes one 10 m³ scale to
20 m³ when a second linked application is added.

**Proposed correction:** derive classification from the scale's owning package/application and count
each saved scale once. BOIC must retain package classification and its permit/application relationship.
Do not use an arbitrary application or `SUM(DISTINCT volume)`, which would discard separate equal-volume scales.
**Business approval needed:** prioritize assessment of the inflated totals where this report supports
operational decisions; confirm the affected use and ordinary/BOIC ownership rules before authorizing
a correction. If approved, acceptance must cover mixed classifications, equal-volume scales and
missing optional relationships in Oracle.

## PARITY-001 — Species/Grade report parameters were bound in the wrong order

Modern initially sent permit status in parameter 10 instead of 4, shifting the other report criteria.
[Commit b8cf50ff](https://github.com/bcgov/nr-lexis/commit/b8cf50ff) restores the legacy order:
status 4, exemption number/type/reason 5–7, growth 8, timber mark 9 and forest file 10. It also supplies
the dedicated Species/Grade PDF layout.

[Binding tests](../backend/src/test/java/ca/bc/gov/mof/lexis/service/report/OracleLegacyCsvReportServiceTest.java)
and [report rendering tests](../backend/src/test/java/ca/bc/gov/mof/lexis/service/report/OracleLegacyJasperTableReportServiceTest.java)
protect the correction. The inherited SQL issues in LEGACY-012–016 remain proposals awaiting business approval.

## PARITY-002 — A stored zero override blocked unrelated permit edits

Legacy treats a stored fee override of zero as disabled. Modern merged that zero into an update that
omitted override fields, then rejected the save because an enabled override must be positive.

[Commit 77a6ef52](https://github.com/bcgov/nr-lexis/commit/77a6ef52) treats an omitted stored-zero
override as disabled while preserving explicit override validation.
[Permit service tests](../backend/src/test/java/ca/bc/gov/mof/lexis/service/permit/OraclePermitDetailsRpcServiceTest.java)
cover the unrelated edit. Acceptance passed on DEV deployment 174 against TEST data.
No Oracle change is required.

## PARITY-003 — BOIC package classification and current volume used the wrong values

Modern could display hidden-application classification instead of the BOIC package's classification,
and declared volume instead of the current scale total. Legacy's BOIC Items endpoint supplies the
package classification and calculated scale total separately.

[Commit 77a6ef52](https://github.com/bcgov/nr-lexis/commit/77a6ef52) makes package classification
authoritative and uses scaled/current volume with a null-aware fallback that preserves zero.
[Permit service tests](../backend/src/test/java/ca/bc/gov/mof/lexis/service/permit/OraclePermitDetailsRpcServiceTest.java)
protect classification precedence. Product display and a zero-to-positive scaled-volume change passed
on DEV-174 against TEST data. The padded-sibling and offer checks in LEGACY-002 remain outstanding.

## PARITY-004 — Approved applications could not receive supported review transitions

Modern reused the approval source states (`NEW`, `PND`) for review changes, blocking supported
rejection, withdrawal or expiry of an `APP` application.

[Commit 503f0c70](https://github.com/bcgov/nr-lexis/commit/503f0c70) separates approval from review:
authorized review changes also accept `APP`, while repeat approval remains blocked. Existing remarks,
permissions and record guards still apply. [Service tests](../backend/src/test/java/ca/bc/gov/mof/lexis/service/review/ApplicationReviewOracleServiceTest.java)
and [review UI tests](../frontend/src/pages/__tests__/ProvincialApplicationDetailReview.test.tsx)
protect the transitions. No Oracle change is required.

## PARITY-005 — Permit totals stay stale after scale changes

Modern refreshed Items after attaching/detaching ordinary permit scales or adding/removing BOIC
scales, but left permit volume and pieces at their earlier values. Legacy's BOIC add/delete handlers
refresh the permit summary after a successful change.

[Commit d08fac64](https://github.com/bcgov/nr-lexis/commit/d08fac64) reloads authoritative permit
totals alongside tab data and updates the displayed volume and pieces. It preserves other form edits.
[Permit action tests](../frontend/src/pages/__tests__/ProvincialPermitDetailActions.test.tsx)
check the refreshed summary after BOIC scale changes. No Oracle change is required.

## PARITY-006 — Offer eligibility and dates use cached application state

Modern cached offer application details and eligibility for 30 seconds. Returning after an application
edit could reuse the previous eligibility result or advertising/review dates. Legacy's offer form
requests these values again when validating the application.

[Commit d08fac64](https://github.com/bcgov/nr-lexis/commit/d08fac64) removes caching for these two
application-context requests. [Offer service tests](../frontend/src/service/__tests__/provincial-offer-create-service.test.ts)
protect that behavior. Package lists and volume lookups have separate caching and are outside this
completed correction. This entry does not close the pending padded-package offer acceptance.

## PARITY-007 — Cleared report dates are replaced or rejected

Modern reapplied initial Advertising List or Tenure date defaults during report generation. Clearing
a bound could silently restore a restriction; Advertising List also rejected one-sided ranges that
legacy supports. Initial screen defaults and an intentionally open range need different handling.

[Commit 56103f50](https://github.com/bcgov/nr-lexis/commit/56103f50) preserves explicitly cleared
dates through the form, request and backend, retaining legacy open-bound report behavior.
[Report UI tests](../frontend/src/pages/__tests__/ReportsPageActions.test.tsx) cover cleared dates
and URL restoration; [report service tests](../backend/src/test/java/ca/bc/gov/mof/lexis/service/report/OracleLexisReportServiceFormatSupportTest.java)
cover generation defaults. This modern correction requires no procedure change and is separate from
Species/Grade's wrong Oracle date guard in LEGACY-013.

## PARITY-008 — Permit summary omits associated applications and packages

Modern's permit summary relied on singular detail fields, so a permit with multiple linked
applications/packages could display an incomplete list or blanks. Legacy supports these multiple
relationships in its permit form.

[Commit b480afcb](https://github.com/bcgov/nr-lexis/commit/b480afcb) builds the summary from the
associated application and package collections, falling back to the singular fields when needed.
[Permit action tests](../frontend/src/pages/__tests__/ProvincialPermitDetailActions.test.tsx)
cover two applications and two packages with null singular fields. The correction changes display,
not stored relationships; no Oracle change is required.

## PARITY-009 — Tenure report variants share unrelated filters

Modern used one combined field set for Permit details, Tenure types and Timber marks reports.
Inactive filters could enter another variant's request, and failed reference lookups for hidden permit
criteria could block a Timber marks report. Legacy's separate generation actions clear unrelated inputs.

[Commit 56103f50](https://github.com/bcgov/nr-lexis/commit/56103f50) shows and submits only the
selected variant's criteria and loads only its required options. Other draft selections survive switching
back. [Report UI tests](../frontend/src/pages/__tests__/ReportsPageActions.test.tsx) check variant
payloads, restored drafts and generation despite an unrelated lookup failure. No Oracle change is required.
