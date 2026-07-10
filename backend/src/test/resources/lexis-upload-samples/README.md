# LEXIS upload samples

Manual XML application upload samples for `/provincial/application/upload`.

Pass cases:

- `pass-application-rsc.xml`
- `pass-application-rsi.xml`
- `pass-application-rkb.xml`

Failure cases:

- `fail-missing-boom-number.xml` should fail because the package/boom number is missing.
- `fail-federal-jurisdiction.xml` should fail because federal submissions require the documented
  `officeUseOnly` metadata and federal applicant details.

Use the pass files together to exercise multi-upload validation and submit. Use the failure files with one or more pass files to verify per-file validation errors in the upload queue.

The files are synthetic and non-production. Archived federal submissions must be sanitized in an
approved private workspace before representative federal fixtures are added here.
