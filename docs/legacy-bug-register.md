# Legacy bug register

LEXIS is being lifted into the modern framework. On 11 September 2026, the project owner confirmed that clear legacy bugs may be corrected using the best supported assumption, provided the evidence, decision and outcome are recorded here. Preserve the business workflow; this is not permission to add unrelated features or invent eligibility rules.

Record source findings separately from observed behavior and deployed verification. A bug in the local legacy source is not proof that the deployed legacy build contains that exact revision. Keep TEST identifiers, user details, logs and screenshots in private verification notes, outside this public repository. Business-approved feature differences remain in [intentional legacy divergences](intentional-legacy-divergences.md).

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
