---
name: update-manual
description: Update the LEXIS end-user manuals in docs/manual/ (industry edition for Business BCeID users, ministry edition for IDIR staff) after a change to user-visible behaviour (screens, menu items, fields, buttons, workflows, statuses, validation, emails, roles, reports). Use whenever frontend/src or backend/src/main changed in a way a user would notice, or when the check-manual Stop hook asks for it. Ends with a secrets and personal-data sweep of the changed text, screenshots and PDFs.
---

# Updating the LEXIS user manuals

The manuals in `docs/manual/` are for **end users**, not developers. There are
two editions, one per sign-in:

| Edition | Folder | Readers |
|---|---|---|
| Industry | `docs/manual/industry/` | Business BCeID users: Provincial Submitter. Federal Read Only (NEXCOL) has no manual. |
| Ministry | `docs/manual/ministry/` | IDIR staff: Read Only, Application Approver, Exemption Approver, Administrator |

The ministry edition is the source for four PDFs, one for each staff role.
LEXIS offers each user the PDF for their role under **Support** in the menu
(`userManualsForRoles` in `frontend/src/utils/support.ts`).

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
| `pages/Federal`, `pages/FederalApplicationDetails`, `backend/.../service/federal/**` | none | `06-federal-applications.md` |
| `pages/Reports`, `backend/.../service/report/**`, `backend/src/main/resources/reports/**` | none | `07-reports.md` |
| `pages/AdminPolicies`, `pages/RTMEmsLogAmv`, `pages/AdminUploads`, `backend/.../service/{admin,rtm}/**` | none | `08-administration.md` |
| `backend/.../service/mail/**`, `backend/src/main/resources/mail/**` | the chapter of the record the email is about | same |
| `backend/src/main/resources/application.yml` (`role-actions`), `backend/.../security/**`, `backend/.../service/session/**`, `routes/routePaths.tsx`, `NAVIGATION_SECTIONS` and `ROLE_LABELS` in `components/Layout.tsx` | `06-who-can-do-what.md` | `09-who-can-do-what.md` (and the affected chapter) |
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
- Ministry edition: mark what each role gets with `roles` comments, as
  described in `docs/manual/README.md`. A role's manual holds only what that
  role can see and do, so mark a task, table row or sentence for the roles
  that have it (`role-actions` in `application.yml`), and write a short
  variant where a role sees the screen but can't change it. Write to "you",
  not "Application Approvers can".

## 4. Screenshots and the PDFs

Screenshots live in `docs/manual/<edition>/images/` and are referenced as
`![Caption](images/NN-name.png)`. The caption doubles as the figure caption
in the PDF. They are produced by `frontend/e2e/manual.screenshots.spec.ts`;
don't hand-edit images.

- **Industry edition:** a synthetic session with mocked API responses (there
  is no Business BCeID test login). If a change alters a screen that has a
  screenshot, or adds one worth showing, add or update its `SHOTS` entry and
  the data in `frontend/e2e/utils/manual-fixtures.ts` for any API call the
  screen makes. A call with no fixture fails the capture and names the path.
  Keep every fixture value fictional ("Jordan Sample", "Example Forestry
  Ltd.", `example.com`); never paste a record from TEST or PROD into it.
- **Ministry edition:** a signed-in IDIR session on a real environment. The
  capture is read-only: it blocks every write, opens screens and picks
  records through searches. Personal details in API responses are swapped
  for sample ones by `frontend/e2e/utils/manual-sample-details.ts`; add any
  new field that holds a person, company, contact detail or free text
  there. A screen the environment has no record for is reported as
  `Not captured` and its image is left as it was.
- Recapture the industry edition: `cd frontend && npm run manual:screenshots`.
  It starts the local dev server and needs no credentials.
- Recapture both editions: the same command with `E2E_BASE_URL` set to TEST,
  DEV, a PR preview or a local full stack, and `E2E_IDIR_USER`,
  `E2E_IDIR_PASSWORD` and `E2E_IDIR_TOTP_SECRET` exported. Never write the
  credentials into a file, command or message.
- The ministry images are captured as an Administrator and shared by the four
  role manuals. Mark an image line for the roles that have that screen.
- Rebuild the PDFs after any manual change: `cd frontend && npm run manual:pdf`
  (writes the industry manual and the four role manuals to
  `frontend/public/manuals/`). Figures are at most 100 mm tall, so keep
  a capture to about one screen; frame a lower part of a page with `focus`.
- `npm run manual:check` runs the build's role, link and table checks without
  a browser. Run it after every ministry edit.
- The capture and the PDF build launch Chromium. If it can't start where you
  are running (a sandboxed session), say which images and PDFs are now out of
  date and give the user the commands to run.

## 5. Secrets and personal-data sweep

The repository is public, so run this sweep on every manual change before you
report done: every new or changed chapter, image and the rebuilt PDFs. Fix
anything found; never just mention it.

1. **Text.** Grep the changed manual files (and the capture code if you
   touched it):
   `git diff --name-only HEAD -- docs/manual frontend/e2e/manual.screenshots.spec.ts frontend/e2e/utils/manual-fixtures.ts frontend/e2e/utils/manual-sample-details.ts`
   plus untracked files, against
   `password|secret|token|api[_-]?key|bearer|BEGIN .*PRIVATE|eyJ[A-Za-z0-9_-]{10,}|AKIA|ghp_|sk-|jdbc:|@gov\.bc\.ca|IDIR\\[A-Z]|BCEID\\[A-Z0-9]`.
   Matches that only name a concept ("token", `IDIR\NAME`) are fine, and so
   are the export office mailboxes the login page itself shows. Any real
   credential, person or personal mailbox is not. Never print a credential
   value you find, only the file and line.
2. **Screenshots: look at every new or changed image** (Read the PNG). The
   ministry images show a real environment, so check each one field by
   field. Reject it and fix the capture if it shows any of:
   - a real person's name, user id, email, phone number or address (only the
     sample identities `JSAMPLE` / `PEXAMPLE`, "Jordan Sample", "Pat Example"
     and `example.com` addresses are allowed);
   - a real client or company name (sample companies only), or free text
     someone typed into the environment;
   - a token, cookie, URL with query secrets, devtools, an error stack trace
     or the browser address bar.
3. **Image metadata.** PNGs must carry no `tEXt`/`iTXt`/`zTXt`/`eXIf`
   chunks (Playwright writes none; anything else added them).
4. **PDFs.** After `npm run manual:pdf`, check each PDF in
   `frontend/public/manuals/`: its decompressed streams
   hold no `/Users/`, `file://` or local usernames, and that its Info has only
   Title, Creator, Producer and the build dates.

Report the sweep result in your summary (clean, or what you fixed).

## 6. Finish

- Edit only the chapters affected. Keep the tables in step: a removed screen
  leaves no row behind.
- If you added or renamed a chapter, update that edition's `README.md`.
- A new role or a renamed manual also changes `userManualsForRoles` and the
  `MANUALS` list in `frontend/scripts/build-manual-pdf.mjs`.
- In your summary to the user, list which manual sections you changed, by
  edition, and for the ministry edition which roles get them.
