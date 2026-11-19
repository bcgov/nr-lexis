# LEXIS user manuals

The manuals for the people who use the Log Exemption Information System. Each
user gets the manual for their role, as a download under **Support** at the
bottom of the LEXIS menu.

| Manual | For | Chapters |
|---|---|---|
| Industry | Business BCeID users: companies applying for exemptions and permits or making offers, and their agents | [industry/](industry/README.md) |
| Administrator, Application Approver, Exemption Approver, Read Only | IDIR staff, one manual for each role | [ministry/](ministry/README.md) |

The PDFs are in [`frontend/public/manuals/`](../../frontend/public/manuals).

## Role manuals

The ministry chapters are one source for four manuals. A `roles` comment
marks what a role gets; unmarked text goes to every role.

- At the end of a line it applies to that line: a chapter title, a table row
  or a list item, for example
  `# 8. Administration <!-- roles: administrator -->`.
- On a line of its own it opens a block that `<!-- /roles -->` closes. Blocks
  don't nest.

The role names are `administrator`, `application-approver`,
`exemption-approver` and `read-only`. A chapter whose title a role doesn't
get is left out of that role's manual, and its chapters are renumbered. The
build fails on an unknown role, an unclosed block, a table left with no
rows, or a link to a chapter or section the manual doesn't have.

## Keeping the manuals current

The manuals live in the repository next to the code and are updated in the
same change as the feature they describe. Developers: see the `update-manual`
skill in `.claude/skills/update-manual/SKILL.md` for the conventions and the
source → chapter mapping. In `frontend/`, `npm run manual:screenshots`
captures the images, `npm run manual:pdf` builds the PDFs and
`npm run manual:check` runs the build's checks without a browser.
