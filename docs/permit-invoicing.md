# Permit invoicing

LEXIS keeps Canadian permit invoicing internal. In `legacy-best-effort` mode, it sends
non-Canadian permit invoices to the General Billing Management System (GBMS).

## Runtime modes

`LEXIS_PERMIT_INVOICE_MODE` selects one coordinator:

| Mode | Behaviour |
|---|---|
| `legacy-best-effort` | Default legacy-parity mode. Processes Canadian internal invoices and the legacy-compatible non-Canadian GBMS flow. |
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

## Consistency and recovery

This integration is ordered synchronous best effort, not an atomic distributed transaction. A
GBMS procedure may commit before a later step fails, and a timeout can leave the result unknown.
LEXIS therefore does not automatically retry a failed GBMS operation. A later request stops when
the permit-history lookup returns an active non-negative GBMS invoice without an internal link.
A header that failed before its permit reference was committed may not yet be discoverable through
that lookup.

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
from a timed-out header call also requires a GBMS correlation/idempotency key or a lookup contract
that can prove whether the header was created.

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
