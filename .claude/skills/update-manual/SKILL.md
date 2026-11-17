---
name: update-manual
description: Update the LEXIS end-user manuals in docs/manual/ (industry edition for Business BCeID users, ministry edition for IDIR staff) after a change to user-visible behaviour (screens, menu items, fields, buttons, workflows, statuses, validation, emails, roles, reports). Use whenever frontend/src or backend/src/main changed in a way a user would notice, or when the check-manual Stop hook asks for it. Ends with a secrets and personal-data sweep of the changed text, screenshots and PDFs.
---

# Updating the LEXIS user manuals

The manuals in `docs/manual/` are for **end users**, not developers. There are
two editions, one per sign-in:

| Edition | Folder | Readers |
|---|---|---|
| Industry | `docs/manual/industry/` | Business BCeID users: Provincial Submitter, Federal Read Only |
| Ministry | `docs/manual/ministry/` | IDIR staff: Read Only, Application Approver, Exemption Approver, Administrator |

Keep both in step with the code in the same change.

## 1. Decide whether the manuals need to change

List what changed: `git diff --name-only HEAD` plus untracked files.

**Update the manuals** when a change alters anything a user sees or does:
- a screen added, removed, renamed or moved in the menu
- filters, columns, form fields, required fields, defaults, limits or validation
- a button or action added, removed or relabelled, or its availability
  (role, region, record status)
- a workflow or status change (application, offer, exemption, permit)
- an email LEXIS sends, who receives it, or whether the user can skip it
- a role or what a role can do
- a report added, removed or renamed, or its options
- logging in, organization selection, the profile panel or session time-out

**Don't update the manuals** for refactors, tests, performance work, logging,
build/CI/deploy changes, backend changes with the same results, or developer
docs. In that case say in one sentence why no user-visible behaviour changed,
and stop.

A change usually lands in one edition only. A screen both audiences use (a
record page, a search) is described in both, each from its reader's side.

## 2. Find the chapter(s) to edit

| Source | Industry | Ministry |
|---|---|---|
| `pages/Landing`, `pages/ForestClientSelection`, `pages/Unauthorized`, `pages/Forbidden`, `pages/Notifications`, `pages/ProvincialSummary`, `components/Layout.tsx` (menu, profile panel), `components/SessionTimeoutWarning`, `components/UnsavedChangesGuard`, `components/OptimisticConflictModal.tsx`, `components/documents/**`, `components/uploads/**`, shared search and record behaviour in `components/**` and `pages/shared/**`, `context/auth/**` | `01-getting-started.md` | `01-getting-started.md` |
| `pages/ProvincialApplicationCreate`, `pages/ProvincialApplicationUpload`, `pages/ProvincialApplication`, `pages/ProvincialApplicationDetails`, `backend/.../service/{application,upload,scan}/**` | `02-applications.md` | `02-applications.md` |
| `pages/ProvincialReview`, `backend/.../service/review/**` | none | `02-applications.md` |
| `pages/ProvincialOfferCreate`, `pages/ProvincialOffers`, `pages/ProvincialOfferDetails`, `pages/shared/OfferFormSection.tsx`, `backend/.../service/offer/**` | `03-offers.md` | `03-offers.md` |
| `pages/ProvincialExemption`, `pages/ProvincialExemptionDetails`, `backend/.../service/exemption/**` | `04-exemptions.md` | `04-exemptions.md` |
| `pages/ProvincialExemptionCreate`, `components/ExemptionApprovalModal.tsx` | none | `04-exemptions.md` |
| `pages/ProvincialPermit`, `pages/ProvincialPermitDetails`, `pages/ProvincialBlanketOicPermitCreate`, `backend/.../service/permit/**` | `05-permits.md` | `05-permits.md` |
| `pages/Federal`, `pages/FederalApplicationDetails`, `backend/.../service/federal/**` | `06-federal-applications.md` | `06-federal-applications.md` |
| `pages/Reports`, `backend/.../service/report/**`, `backend/src/main/resources/reports/**` | none | `07-reports.md` |
| `pages/AdminPolicies`, `pages/RTMEmsLogAmv`, `pages/AdminUploads`, `backend/.../service/{admin,rtm}/**` | none | `08-administration.md` |
| `backend/.../service/mail/**`, `backend/src/main/resources/mail/**` | the chapter of the record the email is about | same |
| `backend/src/main/resources/application.yml` (`role-actions`), `backend/.../security/**`, `backend/.../service/session/**`, `routes/routePaths.tsx`, `NAVIGATION_SECTIONS` and `ROLE_LABELS` in `components/Layout.tsx` | `07-who-can-do-what.md` | `09-who-can-do-what.md` (and the affected chapter) |
| A new area in the menu | New chapter: add it to that edition's `README.md` and this table |

Frontend paths are under `frontend/src/`; `backend/...` =
`backend/src/main/java/ca/bc/gov/mof/lexis/`.

The page components are the source of truth for what users see: read the
labels, helper text, messages and the conditions around them rather than
guessing. What each role is granted is `role-actions` in `application.yml`;
the menu and role display names are in `components/Layout.tsx`; business rules
that differ from legacy LEXIS are in `docs/intentional-legacy-divergences.md`.

## 3. Style

- Write for the user. Use the on-screen labels exactly, in **bold**:
  **Save**, **Apply for new permit**, **Provincial › Application search**.
- Use role display names ("Application Approver"), never `LEXIS_APPLICATION_APPROVER`
  or an action key such as `createPermit`.
- Never mention legacy screens, database tables, procedures, class names, API
  paths or file paths.
- Each chapter: a short intro (what the area is for, who uses it) → a
  **Screens** table (menu item → what it's for, plus a "Who" column where
  access differs) → **Common tasks** as numbered steps.
- Put only menu screens in the Screens table. Describe screens reached from a
  result or a button (record pages, tabs, side panels, dialogs) inside the
  task that uses them.
- Notes and tips are blockquotes: `> **Tip:** …`.
- Short sentences, active voice, present tense. Canadian spelling.
- Don't describe what is planned or not yet built. Describe the app as it is
  in this change.
- Industry edition: only what a Business BCeID user can see and do. Staff-only
  steps appear there as what staff do next ("Export office staff review the
  request"), never as instructions.

## 4. Screenshots and the PDFs

Screenshots live in `docs/manual/<edition>/images/` and are referenced as
`![Caption](images/NN-name.png)`. The caption doubles as the figure caption
in the PDF. They are produced by `frontend/e2e/manual.screenshots.spec.ts`
from a synthetic session with mocked API responses: no sign-in, no
environment data, the same result on every run. The responses come from
`frontend/e2e/utils/manual-fixtures.ts`, one fictional set of records shared
by every shot.

- If a change alters a screen that has a screenshot, or adds a screen worth
  showing, add or update its `SHOTS` entry in the spec and the fixture for
  any API call the screen makes. A call with no fixture fails the capture and
  names the missing path. Don't hand-edit images.
- Keep every fixture value fictional: sample people ("Jordan Sample"),
  sample companies ("Example Forestry Ltd."), `example.com` addresses. Never
  paste a record from TEST or PROD into a fixture.
- Recapture: `cd frontend && npm run manual:screenshots`. It starts the local
  dev server itself and needs no credentials.
- Rebuild the PDFs after any manual change: `cd frontend && npm run manual:pdf`
  (writes `docs/manual/LEXIS-Industry-User-Manual.pdf` and
  `LEXIS-Ministry-User-Manual.pdf`; it stops if a chapter names an image that
  doesn't exist).
- Both commands launch Chromium. If it can't start where you are running (a
  sandboxed session), say which images and PDFs are now out of date and give
  the user the two commands to run.

## 5. Secrets and personal-data sweep

The repository is public, so run this sweep on every manual change before you
report done: every new or changed chapter, image and the rebuilt PDFs. Fix
anything found; never just mention it.

1. **Text.** Grep the changed manual files (and the spec if you touched it):
   `git diff --name-only HEAD -- docs/manual frontend/e2e/manual.screenshots.spec.ts frontend/e2e/utils/manual-fixtures.ts`
   plus untracked files, against
   `password|secret|token|api[_-]?key|bearer|BEGIN .*PRIVATE|eyJ[A-Za-z0-9_-]{10,}|AKIA|ghp_|sk-|jdbc:|@gov\.bc\.ca|IDIR\\[A-Z]|BCEID\\[A-Z0-9]`.
   Matches that only name a concept ("token", `IDIR\NAME`) are fine, and so
   are the export office mailboxes the login page itself shows. Any real
   credential, person or personal mailbox is not. Never print a credential
   value you find, only the file and line.
2. **Screenshots: look at every new or changed image** (Read the PNG). Reject
   and fix the spec if it shows any of:
   - a real person's name, user id, email or phone number (only the sample
     identity `JSAMPLE` and the fictional fixture names are allowed);
   - a real client name, or any record copied from an environment;
   - a token, cookie, URL with query secrets, devtools, an error stack trace
     or a hostname other than the local dev server.
3. **Image metadata.** PNGs must carry no `tEXt`/`iTXt`/`zTXt`/`eXIf`
   chunks (Playwright writes none; anything else added them).
4. **PDFs.** After `npm run manual:pdf`, check each PDF's decompressed streams
   hold no `/Users/`, `file://` or local usernames, and that its Info has only
   Title/Creator/Producer.

Report the sweep result in your summary (clean, or what you fixed).

## 6. Finish

- Edit only the chapters affected. Keep the tables in step: a removed screen
  leaves no row behind.
- If you added or renamed a chapter, update that edition's `README.md`.
- In your summary to the user, list which manual sections you changed, by
  edition.
