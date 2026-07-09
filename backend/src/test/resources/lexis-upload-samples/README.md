# LEXIS upload samples

Manual XML application upload samples for `/provincial/application/upload`.

Pass cases:

- `pass-application-rsc.xml`
- `pass-application-rsi.xml`
- `pass-application-rkb.xml`

Failure cases:

- `fail-missing-boom-number.xml` should fail because the package/boom number is missing.
- `fail-federal-jurisdiction.xml` should fail because federal submissions require a federal application number.
- `fail-federal-permit-missing-required.xml` should fail because the payload includes some permit fields but omits required permit/shipping groups.
- `fail-federal-permit-missing-other-port.xml` should fail because `portOfExport=OT` requires `otherPortOfExport`.

Federal synthetic pass case:

- `pass-federal-permit-complete.xml` includes the known federal permit/shipping aliases required by the modern create path.

Use the pass files together to exercise multi-upload validation and submit. Use the failure files with one or more pass files to verify per-file validation errors in the upload queue.

The federal files are synthetic and non-production. They are useful for local parser and endpoint checks only; they do not prove real federal payload compatibility.
