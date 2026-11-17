# LEXIS user manuals

The manuals for the people who use the Log Exemption Information System, in
two editions:

| Edition | For | Chapters | PDF |
|---|---|---|---|
| Industry | Business BCeID users: companies applying for exemptions and permits or making offers, their agents, and federal application viewers | [industry/](industry/README.md) | [LEXIS-Industry-User-Manual.pdf](LEXIS-Industry-User-Manual.pdf) |
| Ministry | IDIR staff: Read Only, Application Approver, Exemption Approver and Administrator | [ministry/](ministry/README.md) | [LEXIS-Ministry-User-Manual.pdf](LEXIS-Ministry-User-Manual.pdf) |

## Keeping the manuals current

The manuals live in the repository next to the code and are updated in the
same change as the feature they describe. Developers: see the `update-manual`
skill in `.claude/skills/update-manual/SKILL.md` for the conventions and the
source → chapter mapping. In `frontend/`, `npm run manual:screenshots`
captures the images from sample data and `npm run manual:pdf` builds the PDFs.
