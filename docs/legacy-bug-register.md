# Legacy bug register

LEXIS is being lifted into the modern framework. On 11 September 2026, the project owner confirmed that clear legacy bugs may be corrected using the best supported assumption, provided the evidence, decision and outcome are recorded here. Preserve the business workflow; this is not permission to add unrelated features or invent eligibility rules.

Record source findings separately from observed behavior and deployed verification. A bug in the local legacy source is not proof that the deployed legacy build contains that exact revision. Keep TEST identifiers, user details, logs and screenshots in private verification notes, outside this public repository. Business-approved feature differences remain in [intentional legacy divergences](intentional-legacy-divergences.md).

Include historical fixes as well as new findings. For each completed fix, retain the affected component, fix reference, deployment date where known, and the evidence supporting closure. A database fix shared by legacy and modern belongs in this register even when it required no legacy application release.

## Register summary

| ID                                                                                   | Issue                                                              | Fix scope                                           | Verification status                                                                                         |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [LEGACY-001](#legacy-001--package-update-dereferences-a-missing-exemption-type)      | Package update crashes with no linked exemption                    | Legacy Java defect; modern avoids that prerequisite | Source confirmed; exact live exception unconfirmed                                                          |
| [LEGACY-002](#legacy-002--package-update-uses-display-text-as-the-stored-identity)   | Padded package update can target its plain sibling                 | Modern exact-key handling, PR #228                  | Single-key TEST check passed; BOIC sibling acceptance pending                                               |
| [LEGACY-003](#legacy-003--ordinary-legacy-package-dialogs-omit-classification)       | Missing package age blocks an ordinary comment edit                | Modern application Items default                    | Local fix and regression tests; deployment pending                                                          |
| [LEGACY-004](#legacy-004--timber-mark-joins-duplicate-scale-rows-and-inflate-totals) | One saved scale displays repeatedly and inflates totals/fee inputs | Shared Oracle procedures plus modern direct queries | Historical TEST verification; PROD display confirmed by business after reported 3 September 2026 deployment |

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
- Regression coverage: [PermitRpcRepositoryTest.java](../backend/src/test/java/ca/bc/gov/mof/lexis/repository/permit/PermitRpcRepositoryTest.java) checks that scale and fee queries use the direct timber-mark join and exclude the harvesting-authority join path. The left join retains scales without a matching timber-mark record.

**Before/after evidence:** A controlled TEST case containing one saved scale of 12 pieces and 3.0 m³ previously displayed three rows, 36 pieces and 9.0 m³. After correction, legacy and modern showed one row, 12 pieces and 3.0 m³. The dated incident record also reports representative modern fee checks with no duplicate composite rows and matching totals. Those checks establish the sampled paths, not retrospective correction of all previously issued fees.

**Closure evidence:** The original incident record captured the root cause, paired database migrations and TEST checks on 1 September. The stakeholder correspondence supplied on 11 September adds the reported 3 September PROD deployment and the business confirmation of the corrected production display. The final confirmation has no visible timestamp in the supplied export, so no exact acceptance time is assigned. Private correspondence and record identifiers are retained outside this repository.

**Decision:** Correct the relationship returning the data, preserving one result per saved scale. Do not remove valid punctuation, rewrite timber marks, suppress duplicate display rows, or collapse distinct stored scales to hide the query defect. No operational-data backfill is part of this fix.
