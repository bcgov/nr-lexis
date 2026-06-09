# LEXIS Tools

Repository tools for migration checks and operational support.

## Report Parity Harness

`compare-report-parity.mjs` compares embedded Spring/Jasper report output with legacy `nr-lexis-main` report output. Run it when both applications are pointed at the same Oracle data.

The harness reads cases from `report-parity-cases.json`. CSV cases compare exact bytes. PDF and spreadsheet cases compare response metadata, output size, and hashes because renderer metadata can vary between runs. Add `--exact-binary` when strict byte equality is required.

```bash
LEGACY_REPORT_BASE_URL=http://localhost:8081/nr-lexis \
REPORT_PARITY_COOKIE='SESSION=...' \
REPORT_REGION=1904 \
REPORT_SCHEDULE_ID=12345 \
APPROVED_EXEMPTION_NUMBER=EX-12345 \
PERMIT_NUMBER=900100 \
node tools/compare-report-parity.mjs \
  --modern-base http://localhost:8080/api/lexis/reports \
  --out-dir /tmp/lexis-report-parity
```

Additional case placeholders may be required for a full run: `REPORT_FOREST_FILE_ID`, `REPORT_TENURE_TYPE`, and `REPORT_TIMBER_MARK`. Without `--strict-env`, cases with missing placeholders are skipped.

Useful options:

| Option | Purpose |
|--------|---------|
| `--list` | List available case ids. |
| `--case <id>` | Run one case; can be supplied more than once. |
| `--out-dir <path>` | Write generated files and per-case metadata JSON for diffing. |
| `--strict-env` | Fail instead of skipping cases with missing `${ENV_VAR}` placeholders. |
| `--exact-binary` | Compare every case by exact bytes, including PDF and spreadsheet outputs. |
| `--timeout-ms <ms>` | Override the default 120 second request timeout. |

Auth can be shared across both apps with `REPORT_PARITY_COOKIE`, `REPORT_PARITY_AUTHORIZATION`, and `REPORT_PARITY_CSRF_TOKEN`, or split per side with `MODERN_REPORT_*` and `LEGACY_REPORT_*` variables.
