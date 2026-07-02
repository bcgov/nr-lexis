# LEXIS Tools

Utility scripts for local development and validation.

## Report Parity

`compare-report-parity.mjs` compares selected report outputs against a reference application using the cases in `report-parity-cases.json`. It is optional and intended for focused report validation.

```bash
node tools/compare-report-parity.mjs --list
node tools/compare-report-parity.mjs --case exemption-ledger-pdf --modern-base http://localhost:8080/api/lexis/reports
```

Useful options:

| Option | Purpose |
|--------|---------|
| `--list` | List available case ids. |
| `--case <id>` | Run one case; can be supplied more than once. |
| `--out-dir <path>` | Write generated files and per-case metadata JSON for diffing. |
| `--exact-binary` | Compare every case by exact bytes, including PDF and spreadsheet outputs. |
