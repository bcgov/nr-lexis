# AGENTS.md

Repository facts for automated coding assistants. Teams may edit or remove this file.

## User manual
- The end-user manuals are in `docs/manual/`: an industry edition (Business BCeID users) and a ministry edition (IDIR staff). They are not developer docs. Any change to user-visible behaviour (screens, menu, fields, buttons, workflows, statuses, validation, emails, roles, reports) updates the affected chapters in the same change.
- Conventions, the source → chapter mapping and the secrets/personal-data sweep (text, screenshots, PDFs) required before committing: `.claude/skills/update-manual/SKILL.md`. A Stop hook (`.claude/hooks/check-manual.sh`, wired in `.claude/settings.json`) sends Claude back once if `frontend/src` or `backend/src/main` changed without a `docs/manual/` change.
