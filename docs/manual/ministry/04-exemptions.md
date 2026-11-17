# 4. Exemptions

An exemption authorizes the export of a volume of timber until its expiry
date. Permits are issued against it.

| Type | How it is created | Starts as |
|---|---|---|
| **Ministerial** | From approved applications, in **Application search**. | **New**, until an Exemption Approver or Administrator approves it. |
| **Order in Council** | On **Create exemption**, for a specific applicant. | **Active** |
| **Blanket Order in Council** (Blanket OIC) | On **Create exemption**, for one or more regions. It has no applications. | **Active** |

| Role | Can |
|---|---|
| Application Approver | Create exemptions, change their details, add and remove applications, add and delete documents, start permits. Can't approve a Ministerial exemption. |
| Exemption Approver | Find, change and approve Ministerial exemptions in their regions. Sees no other exemption type and no **Permits** tab. |
| Read Only | Find and open exemptions in their regions. |
| Administrator | Everything, province-wide, including **Print approved exemption**. |

## Exemption statuses

| Status | What it means |
|---|---|
| **New** | A Ministerial exemption waiting for approval. Permits can't be requested. |
| **Active** | Approved. Permits can be requested until the expiry date. |
| **Cancelled** | Cancelled by staff. Its applications that were still Exempted go back to Approved. |
| **Expired** | Set overnight after the expiry date. Its applications and permits are set to Expired with it. The record becomes read-only, except that documents can still be added. |

## Screens

| Menu item | Use it to | Who |
|---|---|---|
| **Provincial › Create exemption** | Create an Order in Council or Blanket OIC exemption. | Application Approver, Administrator |
| **Provincial › Exemption search** | Find exemptions, and approve Ministerial ones. | All staff roles |
| **Provincial › Application search** | Create a Ministerial exemption from approved applications. | Application Approver, Administrator |

## Common tasks

### Create a Ministerial exemption

1. **Provincial › Application search**. Search for the approved
   applications.
2. Tick the applications to include. They must have the same owner and
   agent. A row that can't be ticked explains why when you point at it: the
   application must be approved, have no exemption and no valid offer, and
   its list date must have passed unless it is standing timber.
3. Select **Create exemption** in the bar above the results, then confirm
   with **Create exemption**.

LEXIS assigns the exemption number and opens the new exemption as **New**.
Its approval volume is the applications' total volume, and its expiry date
is today plus the longest application term, at least 30 days. The
applications become **Exempted**.

### Create an Order in Council or Blanket OIC exemption

1. **Provincial › Create exemption**.
2. Choose the **Exemption type**.
3. Enter the **Exemption number** (up to 8 characters). LEXIS checks that it
   isn't already used.
4. Enter the **Approval date**, **Expiry date** and **Approval volume
   (m³)**. For a Blanket OIC, also choose its **Region**, one or more.
5. Add **Conditions** if there are any (up to 250 characters).
6. On the **Fees** tab, set **Override fee rate?** to **Yes** and enter the
   **Fee rate ($/m³)** if the exemption fixes the fee.
7. Select **Save exemption**. The exemption is saved as **Active**.

![Create new exemption](images/04-create-exemption.png)

Applications, documents and permits are added after the exemption is saved.

### Add or remove an exemption's applications

*Application Approver and Administrator. Not for Blanket OIC exemptions.*

1. Open the exemption's **Applications** tab and select **Add
   application**.
2. Enter the **Application number** and select **Save application**.

The application must be approved, not on another exemption, and without a
valid offer. On a Ministerial exemption it must belong to the same owner
and its list date must have passed, and it can't take an **Active**
exemption over its approval volume.

**Remove** is offered on an application that isn't on a permit. The
application goes back to **Approved**. A regional Application Approver needs
every region the exemption covers, and the application's region.

### Change an exemption

Select **Edit exemption details** on the **Exemption details** tab. You
need every region the exemption covers.

- **Status**: set a New or Active exemption to **Cancelled**, or reopen a
  cancelled one. A cancelled Ministerial exemption reopens as **New** or
  **Active**, and a cancelled Order in Council as **Active**. A cancelled
  Blanket OIC can't be reopened.
- **Exemption type**: a Ministerial exemption can be changed to Order in
  Council. No other change of type is possible.
- **Expiry date**: while the exemption is **New**, or for a Blanket OIC
  while it is New or Active.
- **Approval volume (m³)** and **Conditions**: until the exemption is
  cancelled or expired.

A **New** Ministerial exemption can't be made Active here. It has to be
approved. **Expired** is never chosen by hand.

The fee rate is on the **Fees** tab under **Edit fee override**. For a
Ministerial exemption it can change only while the exemption is New.

### Approve a Ministerial exemption

*Exemption Approver and Administrator.*

1. Open the **New** exemption and select **Approve exemption**. Or, in
   **Provincial › Exemption search**, tick one or more New Ministerial
   exemptions and select **Approve**. For an Exemption Approver the search
   starts on Ministerial exemptions with status New.
2. Tick **I certify that this exemption has been approved**.
3. **Send approval email** starts ticked. The **Owner email**, and the
   **Agent email** when the applicant is an agent, come from their client
   locations. Select **Edit recipients** to change an address for this
   approval only, or clear the tick to approve without an email.
4. Select **Approve and send email**, or **Approve exemption**.

![Approving a Ministerial exemption](images/04-exemption-approve.png)

The exemption becomes **Active** with today's date as its approval date.
The email goes from the export mailbox for the region of the exemption's
first application. It gives the exemption
number and lists its application numbers, and its text can't be changed.

An exemption is not approved, and stays **New**, if it has no application,
if its approval volume is less than the total requested volume, or if its
expiry date is missing or already past. The reason is shown: correct it and
approve again. You need every region the exemption covers.

### Print the approved exemption

*Administrator.*

Select **Print approved exemption** at the top of an **Active** exemption.
The report downloads as a file.

### Start a permit

On the **Permits** tab of an **Active** exemption, select **Apply for new
permit**. See [Permits](05-permits.md). Exemption Approvers don't see this
tab.

### Expiry

Each night LEXIS sets exemptions past their expiry date to **Expired**,
together with their applications and permits, and adds a remark to each
application. If you had an exemption open when that happened, your next
save tells you it expired overnight and isn't saved.
