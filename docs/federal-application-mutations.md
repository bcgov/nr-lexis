# Federal application mutations

Modern LEXIS restores the legacy federal detail write journeys for `LEXIS_ADMIN` and `LEXIS_APPLICATION_APPROVER`. `LEXIS_EXEMPTION_APPROVER` has neither federal read nor federal mutation access.

Every `{applicationNumber}` path value below is the internal LEXIS
`EXPORT_EXEMPTION_APPLICATION.APPLICATION_NUMBER` returned by the API as `applicationNumber`. It is
not the externally submitted `FED_APPLICATION_NUMBER`, returned as `federalApplicationNumber`;
that value is display and search metadata and is not guaranteed to be unique.

## Supported actions

| Action | API | Side effects |
|---|---|---|
| Add permit | `POST /api/lexis/federal/applications/{applicationNumber}/permit` | Requires an approved application with no existing permit and at least one package. Inserts the federal permit using the application date, organization unit, and owner client/location. Links every existing application package to the new permit while preserving each package's end uses. |
| Update permit | `PUT /api/lexis/federal/applications/{applicationNumber}/permit` | Verifies that the supplied permit belongs to the application, then calls the legacy federal permit update procedure. |
| Update status | `POST /api/lexis/federal/applications/{applicationNumber}/status` | Allows `NEW` or `PND` to become `APP`. An `APP` application may become `REJ` or `WDN` through its Vancouver business listing day, and requires a remark. Oracle is re-read before every transition. |
| Add remark | `POST /api/lexis/federal/applications/{applicationNumber}/remarks` | Adds a remark to a verified federal application. |
| Update remark | `PUT /api/lexis/federal/applications/{applicationNumber}/remarks/{remarkId}` | Verifies that the remark belongs to the application before updating it. |

The React federal-detail page exposes the same actions only when the session has `manageFederalApplication`. Backend authorization is the security boundary and independently enforces that action.

## Application Review

The shared Application Review queue includes both provincial and federal `NEW` and `PND`
applications. For federal applications it supports:

- `NEW` or `PND` to `APP` through the approval action.
- `NEW` or `PND` to `REJ`, `WDN`, or `EXP` through the status action.
- A required remark for rejection, withdrawal, and expiry.
- Applicant status email only for rejection and withdrawal.

These Review transitions are intentionally separate from the stricter federal-detail status action.
The detail action does not expose manual expiry and only allows post-approval rejection or withdrawal
through the listing day.
