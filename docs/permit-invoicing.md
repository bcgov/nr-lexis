# Permit invoicing

LEXIS keeps Canadian permit invoicing internal. In `legacy-best-effort` mode, it writes
non-Canadian permit invoices to the General Billing Management System (GBMS) through the existing
Oracle integration.

## Oracle integration

LEXIS does not call a GBMS HTTP service or publish a message. It synchronously calls
`THE.LEXIS_GROUP_9` stored procedures over JDBC. Those wrappers delegate to the existing
`THE.LEXIS`, `THE.GBMS_PERSISTENCE`, and `THE.LEXIS_GBMS_INVOICING` packages.

Invoice creation writes the shared GBMS transaction tables `FOREST_INVC_TXN`, `GNRL_INVC_TXN`,
`INVOICE_DTL_TXN`, and `NOTATION_TXN`. The GBMS reporting batch later processes approved rows into
the final GBMS invoice tables. LEXIS uses these procedures:

| Operation | `THE.LEXIS_GROUP_9` procedures |
|---|---|
| Create | `GBMS_INSERT_FRST_INVC_TXN`, `GBMS_INSERT_GNRL_INVC_TXN`, `GBMS_INSERT_INVOICE_DTL_TXN`, `GBMS_INSERT_NOTATION_TXN` |
| Cancel or discard | `GBMS_CANCEL_INVOICE` |
| Replace | `GBMS_SET_REPLACEMENT_INVOICE` |
| Read history | `FIND_GBMS_INVOICE_HISTORY` |

## Runtime modes

`LEXIS_PERMIT_INVOICE_MODE` selects one coordinator:

| Mode | Behaviour |
|---|---|
| `legacy-best-effort` | Default mode. Processes Canadian internal invoices and preserves the successful legacy non-Canadian GBMS sequence with additional failure checks. |
| `canadian-internal` | Rollback mode. Processes Canadian internal invoices and rejects non-Canadian invoice transitions before changing the permit. |
| `disabled` | Operational stop. Rejects every permit transition that requires invoice work. |

Both active modes read GBMS history before Canadian invoice mutations so a prior non-Canadian
cycle cannot leave a second active bill. Fully cancelled or replaced history does not block a
Canadian reissue.

## Non-Canadian flow

Before the first GBMS write, LEXIS calculates and validates the complete invoice, rejects
discoverable active GBMS history that has no internal LEXIS link, and stages the local permit and
application changes in the surrounding transaction. It then performs the legacy sequence:

1. Create the GBMS header, general record, detail lines, and notation.
2. Verify the new invoice through GBMS history.
3. Create the internal LEXIS invoice and scale-level details linked to the GBMS number.
4. Link one eligible prior invoice as replaced when applicable.
5. Commit the staged permit, invoice, and linked-application changes.

Cancellation marks the internal invoice cancelled, asks GBMS to cancel or discard its invoice,
and verifies that the original GBMS invoice is no longer active. `PPD` to `COM` receipt completion
does not create a second invoice.

GBMS calls use a separate transaction and connection so commits performed inside its Oracle
procedures do not commit the surrounding LEXIS permit transaction. Each isolated transaction
requests the `LEXIS_PERMIT_INVOICE_GBMS_TIMEOUT_SECONDS` timeout, which accepts 1-3600 seconds and
defaults to 60. Oracle driver cancellation is best effort, so a timed-out outcome can remain
unknown.

## Legacy alignment

The successful flow is aligned with legacy. Both implementations use the same Oracle procedures,
invoice types, accounting codes, fee calculations, header-to-notation order, cancellation rules,
and one eligible prior replacement invoice. Both create an invoice for `ACT` or `CAN` to `COM` or
`PPD`; `PPD` to `COM` does not create another invoice.

Modern LEXIS deliberately does not reproduce legacy failure defects. Legacy could create an
internal LEXIS invoice after GBMS creation failed, and its cancellation and replacement paths used
the first matching history row without verifying the result. Modern LEXIS instead:

- writes the internal invoice only after GBMS creation is verified;
- rolls back the surrounding permit and linked-application changes when orchestration fails;
- rejects ambiguous or unlinked active history; and
- verifies creation, cancellation, and replacement through GBMS history.

These checks preserve the legacy business outcome for valid data. Inconsistent legacy history can
stop the transition and require reconciliation instead of producing another partial invoice.

## Consistency and recovery

This integration is ordered synchronous best effort, not an atomic distributed transaction. The
existing GBMS detail and notation procedures contain commits, so earlier header, general, or detail
work can be committed before a later step fails. A timeout can also leave the result unknown.
LEXIS therefore does not automatically retry a failed GBMS operation. A later request stops when
the permit-history lookup returns an active non-negative GBMS invoice without an internal link.
History can show that an invoice exists, but it does not prove that every detail and notation step
completed.

When a failure occurs after GBMS processing starts:

1. Do not retry the permit transition immediately.
2. Compare GBMS history with the internal permit-invoice history for the permit.
3. Complete or reverse the partial work through the supported operational process.
4. Retry only after both histories agree.

LEXIS locks the relevant Oracle parent rows in a consistent order to serialize overlapping permit
operations across backend pods. These locks do not coordinate with other GBMS writers, so the
operational reconciliation path is still required for unknown or partial GBMS outcomes.

## Future hardening

Durable eventual consistency requires a LEXIS-owned Oracle operation journal or outbox that stores
the permit transition, request fingerprint, last completed step, GBMS number, attempt state, and
error details. A reconciliation worker could then resume known outcomes. Safe automatic recovery
from a timed-out write also requires a GBMS correlation or idempotency contract, or a lookup that
can prove that every expected invoice component was created.

That hardening can be added without changing the successful permit workflow. Until then, unknown
GBMS outcomes require manual reconciliation.

## TEST acceptance

1. Use a controlled non-Canadian permit to verify creation, internal linkage, cancellation, and
   reissue/replacement.
2. Repeat Canadian completion and cancellation to confirm that the internal-only path is
   unchanged.
3. Monitor structured warnings with `event=lexis_permit_invoice`; any event with
   `gbmsWriteStarted=true` requires reconciliation before retry. Operational monitoring should
   alert on that condition before production use.
4. Use `canadian-internal` to stop non-Canadian processing without disabling Canadian permits, or
   `disabled` to stop all invoice-bearing transitions.
