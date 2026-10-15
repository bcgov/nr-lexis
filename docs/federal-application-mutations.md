# Federal application mutations

A federal application record accepts only remarks and post-approval rejection or withdrawal. `LEXIS_ADMIN` and `LEXIS_APPLICATION_APPROVER` hold `manageFederalApplication`, which these actions require. `LEXIS_EXEMPTION_APPROVER` has neither federal read nor federal mutation access. Federal applications are approved only from Application Review.

Every `{applicationNumber}` path value below is the internal LEXIS
`EXPORT_EXEMPTION_APPLICATION.APPLICATION_NUMBER` returned by the API as `applicationNumber`. It is
not the externally submitted `FED_APPLICATION_NUMBER`, returned as `federalApplicationNumber`;
that value is display and search metadata and is not guaranteed to be unique.

## Supported actions

| Action | API | Side effects |
|---|---|---|
| Update status | `POST /api/lexis/federal/applications/{applicationNumber}/status` | Allows an `APP` application to become `REJ` or `WDN` through its Vancouver business listing day, and requires a remark. A request for `APP` is refused after the record authorization check: approval happens in Application Review. The application edit policy applies, so an `APP` application also needs `/editCompletedApplications`. Oracle is re-read before the transition, and the write only succeeds from `APP`. |
| Add remark | `POST /api/lexis/federal/applications/{applicationNumber}/remarks` | Adds a remark to a verified federal application, at any application status. |
| Update remark | `PUT /api/lexis/federal/applications/{applicationNumber}/remarks/{remarkId}` | Verifies that the remark belongs to the application before updating it, at any application status. |

There are no federal permit, offer or document actions. Every request to `/api/lexis/federal/applications/{applicationNumber}/permit` is denied for every role, and the shared application document upload and deletion endpoints refuse federal applications.

The React federal-detail page offers only remark add and update, and Rejected or Withdrawn for an `APP` application through its listing day, when the session has `manageFederalApplication`. It has no approval or permit action. Backend authorization is the security boundary and independently enforces that action.

## Application Review

The shared Application Review queue includes both provincial and federal `NEW` and `PND`
applications. For federal applications it supports:

- `NEW` or `PND` to `APP` through the approval action, after the same approval readiness checks as provincial applications.
- `NEW` or `PND` to `REJ`, `WDN`, or `EXP` through the status action.
- A required remark for rejection, withdrawal, and expiry.
- Applicant status email only for rejection and withdrawal.

These Review transitions are intentionally separate from the stricter federal-detail status action.
The detail action does not expose approval or manual expiry and only allows post-approval rejection
or withdrawal through the listing day.
