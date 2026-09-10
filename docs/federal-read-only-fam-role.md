# Federal Read Only for NEXCOL users

`LEXIS_FEDERAL_READ_ONLY` (display name **Federal Read Only**) is a concrete FAM role
for NEXCOL team members signing in with **Business BCeID**. It has no forest-client
assignment and does not require client selection. Federal applications arrive through
NEXCOL; this interactive viewing role is separate from NEXCOL's submission scope.

The role grants exactly `/federalApplicationSearch`, `/federalApplicationDetails`, and
`viewFederalApplication`. Users land on Federal application search and can view all
federal applications, including their items, remarks, shipping information, and direct
application documents. Provincial exemption references remain plain text; provincial
permit documents and links to other modules are unavailable.

Provincial searches/details, reports, administration, notifications, uploads, editing,
approval, and submission/validation APIs are denied. Shared document and package read
endpoints verify that their parent application is federal; all write methods remain denied.
The existing PROD read-only rollout also supports this role with the same federal-only grants.
IDIR, Basic BCeID, unknown identity providers, role aliases, and client-suffixed forms do
not receive this role through Cognito token conversion.

## Provisioning

1. Deploy the companion FAM migration `V94__add_lexis_federal_read_only_role.sql`, which
   adds the concrete role to `LEXIS_DEV`, `LEXIS_TEST`, and `LEXIS_PROD`.
2. Deploy the LEXIS changes to the intended environment.
3. Assign **Federal Read Only** in that environment to the NEXCOL user's Business BCeID
   account. Do not enter or create a forest client. Assign only this LEXIS role when the
   user must have federal-only access; recognized roles remain additive.
4. Sign out and sign back in to obtain the new role claims. Verify federal search and
   read-only detail access with that account, plus denial of provincial and write routes.

The existing `LEXIS_READ_ONLY` remains an IDIR staff role. FAM role creation does not
assign any users, and local changes do not deploy the migration or application.
