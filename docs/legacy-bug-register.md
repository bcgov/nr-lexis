# Legacy bug register

LEXIS is being lifted into the modern framework. On 11 September 2026, the project owner confirmed that clear legacy bugs may be corrected using the best supported assumption, provided the evidence, decision and outcome are recorded here. Preserve the business workflow; this is not permission to add unrelated features or invent eligibility rules.

Record source findings separately from observed behavior and deployed verification. A bug in the local legacy source is not proof that the deployed legacy build contains that exact revision. Keep TEST identifiers, user details, logs and screenshots in private verification notes, outside this public repository. Business-approved feature differences remain in [intentional legacy divergences](intentional-legacy-divergences.md).

Include historical fixes as well as new findings. For each completed fix, retain the affected component, fix reference, deployment date where known, and the evidence supporting closure. A database fix shared by legacy and modern belongs in this register even when it required no legacy application release.

**Historical audit, 11 September 2026:** Entries LEGACY-005 through LEGACY-011 were traced through commits, current source, regression coverage and the existing divergence decisions. Their referenced modern commits are contained in the refreshed `origin/main`. Commit dates are development dates, not deployment dates; except where dated live evidence is identified, these entries establish the modern implementation rather than TEST/PROD acceptance. Documentation commits that recorded an already-correct implementation are labelled accordingly. LEGACY-012 and LEGACY-013 are pending database fixes found during the same review. Modern-only regressions, performance-only changes and business-approved feature changes are not counted as historical legacy bugs here.

**Continued audit, 11 September 2026:** LEGACY-014 through LEGACY-016 identify additional inherited report defects. The source review also expands the affected routines for LEGACY-012 and confirms that modern PDF inherits the CSV procedure defects in LEGACY-013 through LEGACY-016. Historical fixes that restored supported legacy workflows are recorded separately as `PARITY` entries below; they are migration gaps, not claims that legacy itself was broken. Routine UI/CI fixes and accepted feature changes remain outside this register.

## Register summary

| ID                                                                                   | Issue                                                              | Fix scope                                             | Verification status                                                                                         |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [LEGACY-001](#legacy-001--package-update-dereferences-a-missing-exemption-type)      | Package update crashes with no linked exemption                    | Legacy Java defect; modern avoids that prerequisite   | Source confirmed; exact live exception unconfirmed                                                          |
| [LEGACY-002](#legacy-002--package-update-uses-display-text-as-the-stored-identity)   | Padded package update can target its plain sibling                 | Modern exact-key handling, PR #228                    | Single-key TEST check passed; BOIC sibling acceptance pending                                               |
| [LEGACY-003](#legacy-003--ordinary-legacy-package-dialogs-omit-classification)       | Missing package age blocks an ordinary comment edit                | Modern application Items default                      | Local fix and regression tests; deployment pending                                                          |
| [LEGACY-004](#legacy-004--timber-mark-joins-duplicate-scale-rows-and-inflate-totals) | One saved scale displays repeatedly and inflates totals/fee inputs | Shared Oracle procedures plus modern direct queries   | Historical TEST verification; PROD display confirmed by business after reported 3 September 2026 deployment |
| [LEGACY-005](#legacy-005--client-contact-details-come-from-the-default-location)     | Client location selector and displayed contact details disagree    | Modern lookup uses the persisted client/location pair | Historical TEST evidence; implementation retained                                                           |
| [LEGACY-006](#legacy-006--valid-shipping-countries-render-blank)                     | Valid saved shipping country is absent from the initial selector   | Modern complete country reference lookup              | Implemented; regression coverage retained                                                                   |
| [LEGACY-007](#legacy-007--impossible-calendar-dates-are-accepted-or-normalized)      | Impossible dates can become different persisted dates              | Modern strict date parsing and editable error state   | Merged fixes; regression coverage retained                                                                  |
| [LEGACY-008](#legacy-008--invoice-identifiers-can-exceed-the-database-character-set) | Invoice identifiers contain characters Oracle cannot represent     | Modern invoice entry/upload validation                | Merged fix; regression coverage retained                                                                    |
| [LEGACY-009](#legacy-009--a-positive-fee-override-rounds-to-zero)                    | Enabled fee override becomes disabled after storage rounding       | Modern permit validation                              | Merged fix; rounding boundary tests retained                                                                |
| [LEGACY-010](#legacy-010--search-joins-duplicate-records-counts-and-balances)        | Joined records multiply search results, counts or balances         | Modern exemption and permit queries                   | Merged fix; query regression coverage retained                                                              |
| [LEGACY-011](#legacy-011--application-save-depends-on-omitted-staff-controls)        | BCeID application save dereferences absent review controls         | Modern authorized summary save                        | Correct behavior recorded in history; scoped save test retained                                             |
| [LEGACY-012](#legacy-012--permit-ledger-omits-the-other-species-code)                | Permit Ledger excludes `OT` volume from its Other subtotal         | Shared Oracle reporting procedure                     | Local database fix; not merged; deployment unverified                                                       |
| [LEGACY-013](#legacy-013--speciesgrade-csv-checks-the-wrong-date-parameter)          | Species/Grade CSV mishandles a one-sided date range                | Shared Oracle reporting procedure                     | Local database fix; not merged; deployment unverified                                                       |
| [LEGACY-014](#legacy-014--speciesgrade-ignores-the-exemption-type-filter)            | Species/Grade ignores the selected exemption type                  | Shared Oracle CSV procedure; modern PDF also affected | Source and offline reproduction confirmed; correction pending                                               |
| [LEGACY-015](#legacy-015--speciesgrade-ignores-the-forest-file-filter)               | Species/Grade ignores the selected Forest file ID                  | Three shared Oracle reporting routines                | Source and offline reproduction confirmed; correction pending                                               |
| [LEGACY-016](#legacy-016--speciesgrade-multiplies-scales-by-linked-applications)     | One scale contributes once per linked application                  | Three shared Oracle reporting routines                | Source and offline reproduction confirmed; correction and Oracle acceptance pending                         |

## Historical migration fixes

These entries record supported legacy behavior that was initially missing or incorrect in modern. Their fix commits are in refreshed modern `origin/main`; historical live checks retain their original role and deployment scope.

| ID                                                                                              | Migration gap                                                           | Correction                                                                 | Verification status                                                                 |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [PARITY-001](#parity-001--speciesgrade-report-parameters-were-bound-in-the-wrong-order)         | Report criteria were sent to the wrong Oracle parameters                | Corrected binding order and dedicated PDF template                         | Merged; binding/render tests retained; inherited SQL defects remain separately open |
| [PARITY-002](#parity-002--a-stored-zero-override-blocked-unrelated-permit-edits)                | A disabled stored override caused a permit save rejection               | Treat an omitted stored-zero override as disabled                          | Merged; regression retained; historical DEV-174 acceptance against TEST data        |
| [PARITY-003](#parity-003--boic-package-classification-and-current-volume-used-the-wrong-values) | BOIC displayed synthetic-application classification and declared volume | Use package classification and authoritative scaled volume, including zero | Merged; regression retained; historical DEV-174 acceptance against TEST data        |
| [PARITY-004](#parity-004--approved-applications-could-not-receive-supported-review-transitions) | Modern blocked review changes from Approved                             | Separate approval source states from review source states                  | Merged; service and UI regression coverage retained                                 |

## Oracle work remaining

All routines below are in `THE.LEXIS_REPORTING`. The reviewed baseline is `nr-mof-db` main `124a515ddd382d195982201d9eb8cede49782f2d`, file `scripts/THE/PACKAGE_BODIES/V9.00402__LEXIS_REPORTING.sql`. No deployed package body was read in this audit.

| Procedure                     | Required correction                                                                                                                                               | Prepared migration status                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `PERMIT_LEDGER_REPORT`        | Include `OT` in the Other subtotal — LEGACY-012                                                                                                                   | Local forward/rollback pair in `982f3140`; not merged                            |
| `SPECIES_GRADE_REPORT_CSV`    | Correct end-date guard; assign exemption-type filter; apply Forest file filter; preserve one contribution per scale; include `OT` — LEGACY-012 through LEGACY-016 | Existing local pair corrects only the end-date guard; other changes not prepared |
| `SPECIES_GRADE_RPT`           | Apply Forest file filter; preserve one contribution per scale; include `OT` — LEGACY-012, LEGACY-015, LEGACY-016                                                  | Correction not prepared                                                          |
| `SPECIES_GRADE_REGION_SUBRPT` | Apply Forest file filter; preserve one contribution per scale; include `OT` — LEGACY-012, LEGACY-015, LEGACY-016                                                  | Correction not prepared                                                          |

The existing reporting migration is therefore only a partial fix. Before release, reconcile it with the current package body, retain a matching rollback, compile in Oracle and exercise the affected report criteria/totals. Modern PDF and CSV both obtain Species/Grade data through `OracleLegacyCsvReportService` and `SPECIES_GRADE_REPORT_CSV`; fixing only the old PDF procedure would leave both modern formats affected.

## LEGACY-001 — Package update dereferences a missing exemption type

**Status:** Defect confirmed in legacy source; likely explanation of the observed legacy TEST failure. Modern does not require a linked exemption merely to update an otherwise editable application package.

**Trigger and evidence:** Create an ordinary application without an exemption, add a package, then edit its comment without renaming it. Creation can succeed, while legacy update dereferences the application's null exemption type before invoking persistence. In the local legacy tree, `ApplicationDetailsRPCAction.updatePackage` calls `dtoo.getExportExemptionTypeCode().equals(...)` at line 913. `OracleExemptionApplicationDAO` maps that value without a default. `LEXIS.FIND_APPLICATION_BY_NUMBER` selects it through a left join to `EXPORT_EXEMPTION`, so no exemption produces null. The matching `LEXIS_GROUP_9.UPDATE_PACKAGE`/`LEXIS.UPDATE_PACKAGE` parameter order is consistent; that update procedure is not reached through this failing source branch.

**Observed boundary:** Legacy UI package creation and a subsequent failed unchanged-name update were observed; fresh readback showed no saved comment change. No legacy server logs or deployed Java artifact were available, so the exact live exception is not confirmed. The generic alert incorrectly says "creating" even for update.

**Decision:** An absent exemption is a normal pre-exemption application state, not a reason to crash. Preserve modern ownership, status, lock, capacity and reference-code validation. Do not copy this null dereference or assign a fabricated exemption to make the workflow work. No change to the legacy deployment or Oracle procedures is proposed here.

**Related:** LEGACY-003 addresses incomplete package classification encountered in the same supported workflow.

## LEGACY-002 — Package update uses display text as the stored identity

**Status:** Legacy browser behavior and source defect confirmed. Modern correction included in PR #228; live BOIC sibling acceptance remains pending.

**Trigger and evidence:** Two package numbers can differ only by trailing whitespace. Legacy creation preserves both raw values. Browser inspection confirmed the padded option's `value` and `textContent` retain its space, while `option.text` does not. Ordinary `items_tab.js:1564` and BOIC `boicItemsTab.js:1053` use `.text` as the update target; their edit dialogs also populate the identifier from `.text`. A padded selection can therefore target its plain sibling. No potentially misdirected legacy write was executed to demonstrate that consequence.

**Decision:** Use the exact stored key for reads, selections and mutations; use a separate readable label to distinguish padding. Never merge siblings or select the write target by trimming a displayed label. Preserve the existing rules for newly entered replacement/create names.

**Modern evidence:** PR #228 includes exact-key repository/service handling and frontend selection fixes. Existing regressions cover padded sibling targeting, volume exclusion and scale association. Single padded-key edit/restoration was verified in TEST; that alone does not prove same-application sibling isolation or the full BOIC workflow.

**Audit correction:** An earlier source assessment said all legacy BOIC operations passed the selected raw key unchanged. That was too broad: these update paths use display text. Legacy's defect is not the expected modern behavior.

## LEGACY-003 — Ordinary legacy package dialogs omit classification

**Status:** Modern application Items correction implemented locally; deployment and Oracle readback pending.

**Trigger and evidence:** Ordinary legacy Add Package exposes package number, volume, dimensions, status, reprocessed indicator and comments, but omits package product type and age class. The create controller reads the omitted parameters as null; both Oracle columns are nullable. A valid application can therefore contain packages with missing classification. Modern already falls back to the application's product type but previously left package age blank, blocking a comment save with "Age class is required."

**Best supported assumption:** On an ordinary non-OIC application, a missing package age can inherit the saved application's age when the effective package product matches the saved application product. This follows the intent visible in legacy's Ministerial update branch, which copies application growth/product classification. A linked exemption is not needed to supply classification already present on the application.

**Modern behavior:** Application Items uses the saved summary's age as a default only when OIC indicator is explicitly `N`, application product values agree, and the package product is absent or matches. Explicit package age/product values remain authoritative. Missing application age, unknown/OIC context and mismatched product do not acquire an inferred age. Required-field validation remains in place. The UI shows the effective inherited classification; opening the page does not write it to Oracle. Saving the package sends the displayed classification through the existing validated endpoint.

New-package entry still requires its existing explicit fields. BOIC permit package forms and services are unchanged. No database backfill, new input normalization or eligibility change is part of this correction.

**Verification:** `ProvincialApplicationDetailItems.test.tsx` covers missing classification and explicit classification while switching between plain/padded siblings and saving the exact padded key. Negative cases retain validation when application age is missing, the context is OIC, or products differ. The existing Items and service suites cover new-package requirements and mutation contracts. Record deployed acceptance separately before marking the issue verified in TEST.

## LEGACY-004 — Timber-mark joins duplicate scale rows and inflate totals

**Status:** Historical fix completed. Legacy and modern TEST behavior was verified on 1 September 2026. The supplied correspondence reports the shared database correction in PROD on 3 September 2026; a subsequent business reply confirms that the affected production application displays one scale line as intended. That is historical business acceptance, not a new live production check or proof of every fee scenario.

**Symptom and impact:** A single persisted scale could appear several times for a timber mark with multiple harvesting-authority relationships. Repeated query rows inflated displayed pieces and volume and could affect export-fee inputs. Reports involved marks both with and without punctuation.

**Root cause:** The scale queries joined `EXPORT_SCALE_DETAIL` through `HARVESTING_HAULING_XREF` to `HARVESTING_AUTHORITY` using the timber mark. Multiple matching authority relationships multiplied each scale row. The defect was in the join relationship; punctuation in the mark did not cause it.

**Correction and references:**

- Shared Oracle fix: [bcgov-c/nr-mof-db PR #735](https://github.com/bcgov-c/nr-mof-db/pull/735), change commit `6bac178b9`. Five `THE.LEXIS` cursors now join directly to the unique `TIMBER_MARK` row and read `TM.CASCADE_SPLIT_CODE`: `FIND_SCALE_DETAIL_BY_ID`, `FIND_SCALE_DETAIL_BY_APP`, `FIND_SCALE_DETAIL_BY_PKG`, `FIND_SCALE_DETAIL_BY_PRM`, and the `INSERT_SCALE_DETAIL` return cursor. Procedure signatures and return columns remain unchanged. Legacy receives the correction through its existing procedure calls; no legacy WAR release is required for this fix.
- Modern direct-query fix: [bcgov/nr-lexis PR #214](https://github.com/bcgov/nr-lexis/pull/214), merged 1 September 2026 as `ce32801ce1eb755e285669a84fa67d0b946e10af`. The same direct join replaces the multiplying relationship in `PermitRpcRepository.CORE_SCALE_SELECT` and the fee query's `SCALE_CONTEXT`. Both corrected queries remain present in the current source.
- Original modern change commit: [06e3cead](https://github.com/bcgov/nr-lexis/commit/06e3cead), `fix: prevent scale query fanout` (20 August 2026), contains those two query corrections; its development date precedes the PR merge/deployment evidence above.
- Regression coverage: [PermitRpcRepositoryTest.java](../backend/src/test/java/ca/bc/gov/mof/lexis/repository/permit/PermitRpcRepositoryTest.java) checks that scale and fee queries use the direct timber-mark join and exclude the harvesting-authority join path. The left join retains scales without a matching timber-mark record.

**Before/after evidence:** A controlled TEST case containing one saved scale of 12 pieces and 3.0 m³ previously displayed three rows, 36 pieces and 9.0 m³. After correction, legacy and modern showed one row, 12 pieces and 3.0 m³. The dated incident record also reports representative modern fee checks with no duplicate composite rows and matching totals. Those checks establish the sampled paths, not retrospective correction of all previously issued fees.

**Closure evidence:** The original incident record captured the root cause, paired database migrations and TEST checks on 1 September. The stakeholder correspondence supplied on 11 September adds the reported 3 September PROD deployment and the business confirmation of the corrected production display. The final confirmation has no visible timestamp in the supplied export, so no exact acceptance time is assigned. Private correspondence and record identifiers are retained outside this repository.

**Decision:** Correct the relationship returning the data, preserving one result per saved scale. Do not remove valid punctuation, rewrite timber marks, suppress duplicate display rows, or collapse distinct stored scales to hide the query defect. No operational-data backfill is part of this fix.

## LEGACY-005 — Client contact details come from the default location

**Status:** Correct modern behavior confirmed in the historical July 2026 TEST investigation and retained in current source. No legacy application correction is claimed.

**Defect:** Legacy exemption `agent-owner_tab.js`, `getClientInfo`, initializes a refresh with location `00`. It loads that location's address, phone, fax and email, then selects the saved non-default location in the dropdown. The label and contact details can therefore describe different locations without changing the saved record. The historical investigation compared persisted location values and both applications' displays.

**Correction and history:** Modern loads contact details using the saved client number and location code together. [Commit dd2029fb](https://github.com/bcgov/nr-lexis/commit/dd2029fb) (31 July 2026) recorded the existing correction as `AUTHORITATIVE_CLIENT_LOCATION_LOOKUP`; it was a decision/comment change, not the original implementation. See [application-client-lookup-service.ts](../frontend/src/service/application-client-lookup-service.ts).

**Regression evidence:** [ProvincialExemptionClientParity.test.tsx](../frontend/src/pages/__tests__/ProvincialExemptionClientParity.test.tsx) asserts requests for the saved non-default locations. Its mocked contact data does not independently establish the actual Oracle address; the dated TEST comparison supplies that evidence. Preserve location-specific lookup rather than copying the legacy display.

## LEGACY-006 — Valid shipping countries render blank

**Status:** Implemented in modern; current reference lookup and regression assertion retained.

**Defect:** Legacy federal application and provincial permit initialization call `LexisSessionUtils.addShortCountryCodesToSession`, which loads only the initial country group. A saved country outside that group can render blank until the full list is loaded. Federal `shipping_tab.js` assigns the saved code to that incomplete selector. This is a display failure for a valid reference value, not an invalid country.

**Correction and history:** Modern [ShippingReferenceRepository.java](../backend/src/main/java/ca/bc/gov/mof/lexis/repository/reference/ShippingReferenceRepository.java) retrieves all active country codes through `FIND_ALL_COUNTRY_CODES`. The reference service was introduced in [commit e774917d](https://github.com/bcgov/nr-lexis/commit/e774917d) (13 July 2026); [commit 1e69dcbe](https://github.com/bcgov/nr-lexis/commit/1e69dcbe) (4 August) recorded `COMPLETE_SHIPPING_COUNTRY_OPTIONS` and added the explicit `AD`/Andorra display assertion.

**Regression evidence:** [shipping-reference-service.test.ts](../frontend/src/service/__tests__/shipping-reference-service.test.ts) covers reference loading, country labels and a read-only fallback to the stored code. No new live country check was performed for this historical backfill.

## LEGACY-007 — Impossible calendar dates are accepted or normalized

**Status:** Modern fixes merged; strict parsing and invalid-input regressions remain in source.

**Defect:** Legacy `LexisFormatUtils.parseDisplayDate` checks a date-shaped pattern and then uses lenient `SimpleDateFormat` parsing. A value such as 30 February can pass the pattern and become a different date. That contradicts the legacy validation intent to reject invalid calendar dates.

**Correction and history:** [Commit 214c665d](https://github.com/bcgov/nr-lexis/commit/214c665d) (27 August 2026) rejects impossible ISO dates. [Commit 41471c7e](https://github.com/bcgov/nr-lexis/commit/41471c7e) and [commit 33ad2347](https://github.com/bcgov/nr-lexis/commit/33ad2347) preserve invalid typed input for correction, including blur handling. [Commit 905cdb3d](https://github.com/bcgov/nr-lexis/commit/905cdb3d) (28 August) makes the backend legacy-format parser strict as well. The recorded decision is `STRICT_DATE_INPUT_VALIDATION`.

**Regression evidence:** [IsoDatePicker.test.tsx](../frontend/src/components/__tests__/IsoDatePicker.test.tsx) covers impossible dates, leap days and retaining invalid text; [DateUtilsTest.java](../backend/src/test/java/ca/bc/gov/mof/lexis/util/DateUtilsTest.java) covers strict backend parsing. This prevents new bad input; no historical date backfill is claimed.

## LEGACY-008 — Invoice identifiers can exceed the database character set

**Status:** Modern entry and upload validation implemented; current rejection tests retained.

**Defect:** Legacy invoice checks do not consistently reject non-US-ASCII identifiers before persistence. Presence and length checks cannot ensure that an identifier is representable in the documented `US7ASCII` `VARCHAR2(9 BYTE)` storage contract. Legacy `SalesInvoice.validate` has no corresponding character-set guard.

**Correction and history:** [Commit 8d8bff03](https://github.com/bcgov/nr-lexis/commit/8d8bff03) (28 August 2026) introduced shared [InvoiceStorageConstraints.java](../backend/src/main/java/ca/bc/gov/mof/lexis/util/InvoiceStorageConstraints.java), including printable US-ASCII invoice-number validation. [Commit 07e2b629](https://github.com/bcgov/nr-lexis/commit/07e2b629) explicitly classified `INVOICE_NUMBER_ENCODING_VALIDATION` as a legacy bug correction. Preserve supported punctuation and the existing nine-character limit.

**Regression evidence:** [OraclePermitDetailsRpcServiceTest.java](../backend/src/test/java/ca/bc/gov/mof/lexis/service/permit/OraclePermitDetailsRpcServiceTest.java) rejects an unrepresentable identifier before repository access; [invoice-storage-validation.test.ts](../frontend/src/pages/shared/__tests__/invoice-storage-validation.test.ts) covers the matching UI validation. This entry concerns identifier encoding, not a change to invoice rounding policy or repair of historical invoices.

## LEGACY-009 — A positive fee override rounds to zero

**Status:** Modern validation fix merged; boundary regression retained.

**Defect:** Legacy treats an override as enabled when its value is greater than zero. A small positive amount can pass that check but round to `0.00` in Oracle's two-decimal column. Legacy's saved-permit display then treats the override as disabled. See legacy `feesTab.js` and `ProvincialPermitForm.isOverrideInd`.

**Correction and history:** [Commit 54e7fb47](https://github.com/bcgov/nr-lexis/commit/54e7fb47) (28 August 2026) requires an enabled override to remain positive after storage rounding. The decision is `PERMIT_OVERRIDE_STORAGE_POSITIVITY`; the existing fee calculation and ordinary Oracle rounding remain unchanged.

**Regression evidence:** [ProvincialPermitMutationValidatorTest.java](../backend/src/test/java/ca/bc/gov/mof/lexis/service/permit/ProvincialPermitMutationValidatorTest.java), `shouldRequireOverrideFeeToRemainPositiveAfterOracleRounding`, rejects `0.001` and accepts `0.005` as stored `0.01`. The frontend displays the corresponding validation error. No recalculation of historical permit fees is claimed.

## LEGACY-010 — Search joins duplicate records, counts and balances

**Status:** Modern query correction merged; canonical query coverage retained. This is separate from the scale-detail join correction in LEGACY-004.

**Defect:** Historical search parity work identified legacy joins where multiple linked applications or access relationships could duplicate exemption results, inflate permit counts and multiply volume balances. A page count or balance should not depend on how many joined rows represent the same exemption or permit.

**Correction and history:** [Commit 15501690](https://github.com/bcgov/nr-lexis/commit/15501690) (31 July 2026) replaced these modern search paths with direct queries that retain one application representative per exemption, aggregate permit volumes separately and deduplicate accessible permits. [Commit b67776f0](https://github.com/bcgov/nr-lexis/commit/b67776f0) (5 August) added explicit canonical page/count assertions and the `CANONICAL_SEARCH_RESULTS` markers.

**Regression evidence:** [ExemptionRepositoryTest.java](../backend/src/test/java/ca/bc/gov/mof/lexis/repository/exemption/ExemptionRepositoryTest.java) checks the canonical exemption candidate set; [PermitRepositoryTest.java](../backend/src/test/java/ca/bc/gov/mof/lexis/repository/permit/PermitRepositoryTest.java) checks deduplicating `UNION` access branches and matching search/count parameters. These are query contract tests, not a new live reconciliation of all balances. Preserve ownership filters while preventing join multiplication.

## LEGACY-011 — Application save depends on omitted staff controls

**Status:** Modern authorized save behavior implemented and covered by a scoped-submitter regression. The historical commit records why the legacy failure must not be copied.

**Defect:** Legacy provincial application `persistence.js`, `updateApplication`, unconditionally reads `applicationStatus.value` and `additionalRemarks.value`. Those controls are inside the `applicationsReview` authorization block in `reviewTab.jsp`; an editor without that staff review capability can have neither element. The save handler can therefore throw before sending an otherwise authorized application update.

**Correction and history:** Modern builds the summary request from its authorized edit state without requiring those optional legacy controls. [Commit 27fb49f8](https://github.com/bcgov/nr-lexis/commit/27fb49f8) (25 August 2026) documented the existing behavior as `BCEID_APPLICATION_EDIT_CONTRACT` and added the source explanation; it did not introduce this save implementation.

**Regression evidence:** [ProvincialApplicationDetailActions.test.tsx](../frontend/src/pages/__tests__/ProvincialApplicationDetailActions.test.tsx), `keeps applicant type and workflow fields read-only for scoped submitters`, saves a summary while the staff status control is absent and preserves submitter confirmation. Keeping application editing available does not grant staff review actions.

## LEGACY-012 — Permit Ledger omits the Other species code

**Status:** Source defect and local database correction identified; not merged. Oracle execution and deployed report acceptance are unverified.

**Defect and proposed correction:** `THE.LEXIS_REPORTING.PERMIT_LEDGER_REPORT` calculates `V_OT` using species `LA`, `WB`, `WH`, `YE` and `UU`, omitting the explicit `OT` code. Saved `OT` scale volume is therefore absent from that Other subtotal. The local correction includes `OT` in this existing group without changing saved scales or other species groups.

**History and verification boundary:** Database commit `982f3140043def8589db4cb13c6469610d28b82d`, `fix: correct lexis report totals and date filters` (26 August 2026), is on the local `nr-mof-db` branch `fix/lexis-reporting-safe-db-fixes`. Its paired forward/rollback `LEXIS_REPORTING` migrations include this change and LEGACY-013. The commit is not in refreshed database `origin/main` (`124a515ddd382d195982201d9eb8cede49782f2d`); that main revision's `V9.00402__LEXIS_REPORTING.sql` still omits `OT` in this routine. Deployment is unverified. Before closure, review the migration and compare the affected report subtotal against saved `OT` scale volume in TEST. Do not treat this narrow correction as verification of every report's species grouping.

**Expanded source finding:** `SPECIES_GRADE_RPT`, `SPECIES_GRADE_REPORT_CSV` and `SPECIES_GRADE_REGION_SUBRPT` also omit `OT` from their Other subtotal. The first two enumerate the same five-code list; the region subreport uses equivalent `CASE` branches without `OT`. The existing local migration does **not** correct these three routines. An offline execution of the CSV SELECT with one synthetic `OT` scale of 10 m³ returned `SUM_OT = 0`. Include `OT` in each existing Other grouping and verify PDF, CSV and region totals before closing the wider issue. This is a proposed extension, not a prepared or deployed correction.

## LEGACY-013 — Species/Grade CSV checks the wrong date parameter

**Status:** Source defect and local database correction identified; not merged. Deployment and report acceptance are unverified.

**Defect and proposed correction:** `THE.LEXIS_REPORTING.SPECIES_GRADE_REPORT_CSV` assigns `V_DATE_TO := P_DATE_TO` only when **`P_DATE_FROM`** is non-null. An end-only filter is ignored; a start-only filter replaces the default upper bound with null, so date comparisons exclude rows. The local correction checks `P_DATE_TO` before assigning the upper bound, preserving independent optional bounds.

**History and verification boundary:** The same local database commit `982f3140043def8589db4cb13c6469610d28b82d` (26 August 2026) contains this fix and its rollback. Refreshed database `origin/main` still contains the wrong guard; this is not a completed deployment. Closure requires Oracle validation and report checks for no dates, start only, end only and both dates, using supported UI inputs where available. Source behavior does not prove which one-sided combinations each deployed screen permits.

**Modern scope confirmed:** The modern report form exposes both optional date bounds, and `applyLegacySpeciesGradeDefaults` supplies only the default permit status. It does not fill missing dates. Both modern PDF and CSV execute this CSV procedure through [OracleLegacyCsvReportService.java](../backend/src/main/java/ca/bc/gov/mof/lexis/service/report/OracleLegacyCsvReportService.java), so acceptance must cover both formats. The old PDF routine's correct date guard does not protect the modern PDF path.

## LEGACY-014 — Species/Grade ignores the exemption-type filter

**Status:** Confirmed in the reviewed database source and an offline relational reproduction. Correction not prepared; deployed impact unverified.

**Evidence:** `SPECIES_GRADE_REPORT_CSV` declares `V_EXEMPTION_TYPE := '%'` and filters with `E.EXPORT_EXEMPTION_TYPE_CODE LIKE V_EXEMPTION_TYPE`, but never assigns `P_EXEMPTION_TYPE` to that local. Legacy `OracleReportingSpeciesGradeDAO` and modern `bindSpeciesGradeParameters` both send the selected type in parameter 6. The modern report form exposes that selection. The old PDF routine `SPECIES_GRADE_RPT` does contain the missing assignment; modern PDF uses the CSV routine instead.

**Proposed correction:** In `THE.LEXIS_REPORTING.SPECIES_GRADE_REPORT_CSV`, assign the supplied non-null exemption type before opening the cursor, retaining `%` for an unfiltered request. This follows the sibling PDF routine and the existing UI contract; no new eligibility rule or Java parameter change is needed.

**Verification:** The checked-in CSV SELECT was executed locally with synthetic Ministerial data. Selecting OIC still returned 10 m³ while the local remained `%`; assigning the requested `O` produced no rows. This used SQLite with bound PL/SQL locals, not an Oracle session. Oracle acceptance should compare unfiltered and each supported type in modern PDF/CSV and legacy CSV. Existing Java binding tests prove the parameter is sent, not that Oracle applies it.

## LEGACY-015 — Species/Grade ignores the Forest file filter

**Status:** Unused filter confirmed in source; correction not prepared. Live report behavior and the deployed package revision remain unverified.

**Evidence:** Legacy and modern forms expose Forest file ID, mutually exclusive with Timber mark. Legacy CSV DAO and modern report service bind it as parameter 10. `SPECIES_GRADE_REPORT_CSV` copies it into `V_FOREST_FILE_ID` but never uses that local in the SELECT. `SPECIES_GRADE_RPT` and `SPECIES_GRADE_REGION_SUBRPT` declare `P_FOREST_FILE_ID` without using it in their query. A nonmatching synthetic forest file left the offline CSV result unchanged at 10 m³.

**Proposed correction:** Apply the supplied filter in all three named `THE.LEXIS_REPORTING` routines. The legacy DAO maps the criterion to `HA.FOREST_FILE_ID`; the best supported implementation is a correlated `EXISTS` lookup from the scale's timber mark to the matching hauling-authority forest file. Preserve established matching behavior and absent-filter behavior. Avoid an unrestricted one-to-many join that would multiply scale volume.

**Remaining validation:** Confirm the authoritative timber-mark/forest-file relationship and matching semantics against current Oracle metadata and existing records. Verify matching, nonmatching and absent file criteria, multiple authority matches, and unchanged Timber mark behavior in both formats. The old PDF query and region subreport also need acceptance; changing the UI to hide the filter would remove an existing workflow rather than fix it.

## LEGACY-016 — Species/Grade multiplies scales by linked applications

**Status:** Multiplying relationship confirmed in source and reproduced offline using one globally unique package. No deployed totals or completed SQL correction are claimed.

**Evidence:** `SPECIES_GRADE_RPT` and `SPECIES_GRADE_REPORT_CSV` join permit scales to `EXPORT_EXEMPTION_APPLICATION` by exemption number alone, then aggregate volumes. `SPECIES_GRADE_REGION_SUBRPT` uses the same exemption-wide application join. An exemption can have several applications, so each scale can contribute repeatedly or appear under another application's product/growth classification. This is distinct from LEGACY-004's harvesting-authority relationship and LEGACY-010's search queries.

**Reproduction:** The actual checked-in CSV SELECT returned 10 m³ for one synthetic scale and one linked application. Adding a second application under the same exemption, with matching report classifications, changed the result to 20 m³. The package number remained globally unique. An ordinary-package candidate join through the package's `APPLICATION_NUMBER` restored 10 m³. The reproduction used an in-memory SQLite database, bound Oracle locals and an emulated grade-sort function; it proves the relational defect, not Oracle deployment acceptance.

**Proposed correction:** In all three routines, derive each scale's classification from its owning package/application relationship and aggregate each saved scale once. Ordinary packages already expose the application relationship; BOIC must preserve package classification and the existing permit/application association. Use a semijoin where an application is needed only for eligibility. Do not choose an arbitrary application or use `SUM(DISTINCT volume)`, which would lose separate equal-volume scales.

**Remaining validation:** Prepare the complete Oracle query correction only after checking ordinary and BOIC ownership paths, mixed classifications, multiple equal-volume scales and missing optional relationships. Compare raw scale IDs/volumes with PDF, CSV and region totals using existing records or fixtures made through supported application workflows. An initial suspicion that package-number reuse caused this defect was rejected: legacy validates package numbers globally and the table documents a unique package identity.

## PARITY-001 — Species/Grade report parameters were bound in the wrong order

**Status:** Historical modern migration defect corrected; inherited procedure defects remain open above.

**Before/after and history:** Legacy `OracleReportingSpeciesGradeDAO.generateReportingSpeciesGrade` passes permit status in slot 4, then exemption number/type/reason, growth, timber mark and forest file in slots 5–10. Modern initially placed permit status in slot 10 and shifted the intervening criteria, so valid report filters reached the wrong Oracle inputs. [Commit b8cf50ff](https://github.com/bcgov/nr-lexis/commit/b8cf50ff), `fix: repair species grade reports` (26 August 2026), restores the legacy order. It also supplies a dedicated Species/Grade PDF template instead of squeezing the report through the generic table layout.

**Evidence and remaining work:** Current [OracleLegacyCsvReportServiceTest.java](../backend/src/test/java/ca/bc/gov/mof/lexis/service/report/OracleLegacyCsvReportServiceTest.java) asserts the individual parameter positions; [OracleLegacyJasperTableReportServiceTest.java](../backend/src/test/java/ca/bc/gov/mof/lexis/service/report/OracleLegacyJasperTableReportServiceTest.java) covers rendering the dedicated report. This correction is in modern `main` and requires no procedure signature change. It does not fix SQL that ignores correctly bound values or multiplies rows: see LEGACY-012 through LEGACY-016.

## PARITY-002 — A stored zero override blocked unrelated permit edits

**Status:** Historical modern migration defect corrected. The dated Administrator audit records acceptance on DEV PR deployment 174 against TEST data; this is not a new production check.

**Before/after and history:** Legacy interprets a stored fee override of zero as disabled. Modern previously merged that zero into an update omitting override fields, then rejected the otherwise valid save because an enabled override must be positive. [Commit 77a6ef52](https://github.com/bcgov/nr-lexis/commit/77a6ef52), `fix: restore exemption and permit parity` (14 August 2026), treats an omitted stored-zero override as disabled while retaining explicit override validation.

**Regression evidence:** [OraclePermitDetailsRpcServiceTest.java](../backend/src/test/java/ca/bc/gov/mof/lexis/service/permit/OraclePermitDetailsRpcServiceTest.java), `updatePermitShouldTreatStoredZeroOverrideAsDisabledWhenTheRequestOmitsIt`, verifies a successful unrelated update. Current service logic retains the correction. No Oracle procedure change is needed. This is separate from LEGACY-009, which prevents a newly enabled positive override from rounding down to zero.

## PARITY-003 — BOIC package classification and current volume used the wrong values

**Status:** Historical migration corrections retained. The dated Administrator audit records the corrected product display and a scaled-volume change from zero on DEV-174 against TEST data.

**Before/after and history:** Modern could prefer the hidden BOIC application's product type over the actual package classification, and could display declared package volume in the Current package volume field. [Commit 77a6ef52](https://github.com/bcgov/nr-lexis/commit/77a6ef52) (14 August 2026) makes BOIC package classification authoritative and maps current volume from `scaledVolume`/`currentPackageVolume`, preserving zero. Legacy `boicItemsTab.js.getOICPackageDetails` calls the application package-details endpoint and displays its package classification and separately calculated scale total. The ordinary permit `getPackageInfo` endpoint is not the legacy BOIC display baseline.

**Regression evidence:** [OraclePermitDetailsRpcServiceTest.java](../backend/src/test/java/ca/bc/gov/mof/lexis/service/permit/OraclePermitDetailsRpcServiceTest.java), `packageInfoShouldUsePackageClassificationsForBlanketOic`, protects classification precedence. Current [provincial-permit-detail-tabs-service.ts](../frontend/src/service/provincial-permit-detail-tabs-service.ts) retains the null-aware scaled-volume mapping. Historical live evidence supplies the zero-to-positive volume check. No Oracle procedure change or new BOIC workflow is required for these display corrections. This entry does not close the current padded-sibling/offer acceptance work.

## PARITY-004 — Approved applications could not receive supported review transitions

**Status:** Historical modern migration defect corrected; source and automated coverage retained. No new live status transition or email was performed in this audit.

**Before/after and history:** Modern reused the approval source-state list (`NEW`, `PND`) for review changes, blocking supported rejection, withdrawal or expiry of an `APP` application. [Commit 503f0c70](https://github.com/bcgov/nr-lexis/commit/503f0c70), `fix: restore approved application review parity` (17 August 2026), separates the two policies: approval remains restricted to `NEW`/`PND`, while authorized review transitions also accept `APP`. Existing remarks, authorization and record guards remain required.

**Regression evidence:** [ApplicationReviewOracleServiceTest.java](../backend/src/test/java/ca/bc/gov/mof/lexis/service/review/ApplicationReviewOracleServiceTest.java) covers permitted review sources and rejects repeat approval; [ProvincialApplicationDetailReview.test.tsx](../frontend/src/pages/__tests__/ProvincialApplicationDetailReview.test.tsx) covers the detail review controls. The current service retains separate source-state lists. The correction belongs in modern policy/UI code; no shared Oracle procedure change is identified for it.
