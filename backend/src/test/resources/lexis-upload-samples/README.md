# LEXIS upload samples

Manual XML application upload samples for `/provincial/application/upload`.

Pass cases:

- `pass-application-rsc.xml`
- `pass-application-rsi.xml`
- `pass-application-rkb.xml`

The pass files use the known-valid test client `00001074/03`, RSC region, and `HE/PL`
species/end-use sort. The filenames retain their original scenario labels, but the data is
kept conservative so the files survive Oracle-backed smoke tests.

Failure cases:

- `fail-missing-boom-number.xml` should fail because the package/boom number is missing.
- `fail-federal-jurisdiction.xml` should fail because only provincial LEXIS submissions are supported.

Use the pass files together to exercise multi-upload validation and submit. Use the failure files with one or more pass files to verify per-file validation errors in the upload queue.
