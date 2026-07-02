# LEXIS upload samples

Manual XML application upload samples for `/provincial/application/upload`.

Pass cases:

- `pass-application-rsc.xml`
- `pass-application-rsi.xml`
- `pass-application-rkb.xml`

Failure cases:

- `fail-missing-boom-number.xml` should fail because the package/boom number is missing.
- `fail-federal-jurisdiction.xml` should fail because federal submissions require a federal application number.

Use the pass files together to exercise multi-upload validation and submit. Use the failure files with one or more pass files to verify per-file validation errors in the upload queue.
