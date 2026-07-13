# Federal application mutations

Modern LEXIS restores the legacy federal detail write journeys for `LEXIS_ADMIN` and `LEXIS_APPLICATION_APPROVER`. `LEXIS_EXEMPTION_APPROVER` has neither federal read nor federal mutation access.

Every `{applicationNumber}` path value below is the internal LEXIS
`EXPORT_EXEMPTION_APPLICATION.APPLICATION_NUMBER` returned by the API as `applicationNumber`. It is
not the externally submitted `FED_APPLICATION_NUMBER`, returned as `federalApplicationNumber`;
that value is display and search metadata and is not guaranteed to be unique.

## Supported actions

| Action | API | Side effects |
|---|---|---|
| Add permit | `POST /api/lexis/federal/applications/{applicationNumber}/permit` | Inserts the federal permit using the application date, organization unit, and owner client/location. Links every existing application package to the new permit while preserving each package's end uses. |
| Update permit | `PUT /api/lexis/federal/applications/{applicationNumber}/permit` | Verifies that the supplied permit belongs to the application, then calls the legacy federal permit update procedure. |
| Update status | `POST /api/lexis/federal/applications/{applicationNumber}/status` | Allows `NEW` or `PND` to become `APP`. An `APP` application may become `REJ` or `WDN` through its Vancouver business listing day, and requires a remark. Oracle is re-read before every transition. |

The React federal-detail page exposes the same actions only when the session has `manageFederalApplication`. Backend authorization is the security boundary and independently enforces that action.
