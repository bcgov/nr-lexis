# Intentional legacy divergences

Modern LEXIS normally preserves functional parity with legacy. Business-approved differences use
the searchable code marker `INTENTIONAL_LEGACY_DIVERGENCE(<ID>)` and are recorded here so they are
not mistaken for parity defects.

| ID                         | Modern behaviour                                                                                                                                                                                                             | Reason                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `SEARCH_STATE_PERSISTENCE` | Applied search filters, sorting, and paging survive in-app navigation. Logout, session expiry, login, and organization changes clear the saved state. A fresh authenticated visit shows no results until Search is selected. | UI review request; legacy does not retain search state across page navigation.                          |
| `DETAIL_VIEW_EDIT_MODES`   | Authorized detail pages open in view mode and expose explicit Edit and Cancel actions.                                                                                                                                       | UI review request to follow the modern design pattern instead of legacy's always-editable presentation. |
| `ADMIN_PAGE_RETIREMENT`    | The Users & Access page and its IDIR lookup API are not exposed. Other administration workflows remain available.                                                                                                            | Business-requested retirement; the legacy administration capability is no longer required.              |

Keep markers next to the controlling code rather than on every consuming component.
