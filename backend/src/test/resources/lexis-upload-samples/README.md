# LEXIS upload samples

Manual XML application upload samples for `/provincial/application/upload`.

Pass cases:

- `pass-application-rsc.xml`
- `pass-application-rsi.xml`
- `pass-application-rkb.xml`
- `pass-federal-application.xml` is a synthetic ESF-wrapped federal payload for the NEXCOL
  validation endpoint. Change its business identifiers before testing the submission endpoint.

The three provincial pass files are named for the scenario, not the region: all of them use region
RSC, because their timber marks are valid there. The accepted region codes are RCB, RKB, RNO, ROM,
RTO, RSK, RSC and RWC, and an XML submission needs a contact surname, first name and telephone
number for the applicant (and for the owner when an owner section is present).

Failure cases:

- `fail-missing-boom-number.xml` should fail because the package/boom number is missing.
- `fail-retired-region.xml` should fail because RSI is not an accepted forest region code.
- `fail-federal-jurisdiction.xml` should fail because federal submissions require the documented
  `officeUseOnly` metadata and federal applicant details.

Use the pass files together to exercise multi-upload validation and submit. Use the failure files with one or more pass files to verify per-file validation errors in the upload queue.

The files are synthetic and non-production. Archived federal submissions must be sanitized in an
approved private workspace before representative federal fixtures are added here.
