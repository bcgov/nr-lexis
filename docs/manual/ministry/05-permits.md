# 5. Permits <!-- roles: administrator, application-approver, read-only -->

A provincial permit allows timber under an Active exemption to be shipped.
Industry users request permits and send them for review. Staff check the
request, confirm the fee in lieu of manufacture, complete the permit and
notify the applicant. Completing a permit creates its invoice.

| Role | Can |
|---|---|
| Application Approver, Administrator | Start, change, complete and cancel permits, set Complete or Payment pending permits back to Active, override fees, enter receipt numbers. An Application Approver works in their regions. | <!-- roles: administrator, application-approver -->
| Read Only | Find and open permits in their regions, open documents and print completed permits. | <!-- roles: read-only -->

## Permit statuses

| Status | What it means |
|---|---|
| **Active** | A request that is not issued yet. The number shows **(Pending)** beside it. |
| **Payment pending** | An interior permit completed without a receipt number. Set automatically. |
| **Complete** | Issued and invoiced. It can be printed. |
| **Cancelled** | Cancelled. Its invoices are cancelled with it. |
| **Expired** | Set overnight when the permit's exemption expires, or by staff. Read-only after that, except for documents. |

## Screens

| Menu item | Use it to |
|---|---|
| **Provincial › Permit search** | Find permits by permit number, application number, package number, region, issued date, status, owner client or agent client. |
| **Provincial › Exemption search** | Open the exemption to start a new permit. | <!-- roles: administrator, application-approver -->

A permit record has these tabs: **Permit**, **Applicant**, **Shipping**,
**Package and scale**, **Documents**, **Fees** and, once the permit has invoice
history, **GBMS**.

## Common tasks

<!-- roles: administrator, application-approver -->
### Find permit requests waiting for review

When a client saves an **Active** permit that has shipping details and a
package with scale, LEXIS offers to email your regional mailbox with the
permit number. The client can decline. To list requests, use **Provincial › Permit
search** with **Permit status** set to **Active**, and your **Region**.
Active permits show **(Pending)** beside the number.

### Start a permit for a client

Open the **Active** exemption's **Permits** tab and select **Apply for new
permit**.

- **Ministerial**: select **Create permit**. The permit is created empty.
  In **Edit permit details**, tick **Include in permit** for each
  application to put on it.
- **Order in Council**: select **Create permit**. Every eligible scale line
  from the exemption's applications is added. The permit is refused if that
  volume is more than the exemption's balance remaining.
- **Blanket OIC**: select **Continue** and fill in the **Apply for new
  permit** form. Staff choose the owner with the **Client** search and can
  set the submit, issued and expiry dates. Packages and scale are added on
  the saved permit's **Package and scale** tab.

A permit can't be deleted once it is created.

### Review a permit request

Open the permit and check each tab.

| Tab | Check |
|---|---|
| **Permit** | The exemption, the region, the applications on the permit, **Current permit pieces** and **Current permit volume (m³)** against **Total volume remaining (m³)**. For a Blanket OIC, the request pieces and volume. |
| **Applicant** | The owner and agent. The **Client location** decides where the invoice goes. |
| **Shipping** | Purchaser, final destination country, transport, estimated shipping date and customs port of export. |
| **Package and scale** | Each package and its summary of scale. |
| **Documents** | The documents your office requires. |
| **Fees** | The fee for each scale line and the totals. |

Each card has its own edit button, for example **Edit shipping details**.
You can correct the client's entries while the permit is **Active**.

> **Order in Council permits** use an older layout. The **Permit** tab has a
> **Permit summary** card with **Edit permit** and **Save permit**, the
> **Shipping** tab has **Edit shipping**, and the receipt number is changed
> with **Edit permit** on the **Fees** tab. Where the steps below say **Edit
> permit details** and **Save changes**, use those buttons instead.
<!-- /roles -->

<!-- roles: read-only -->
### Find a permit

**Provincial › Permit search** finds permits by permit number, application number,
package number, region, issued date, status, owner client or agent client.
Select the number in the first column to open the permit. Active permits
show **(Pending)** beside the number.
<!-- /roles -->

<!-- roles: administrator, application-approver -->
### Check and override the fee
<!-- /roles -->

<!-- roles: read-only -->
### Read the fees
<!-- /roles -->

![Package fees and the rates for a scale line](images/05-permit-fees.png)

**Permit fees** shows **Total volume (m³)** and **Total fees (CAD)**.
**Package fees** shows each scale line with its **AMV ($/m³)**, volume,
**EWB**, **Fee in lieu %**, **Multiplication factor** and **Fee (CAD)**.
When a Blanket OIC permit has a fee override, the line fees and their
rates show a dash. The override appears in **Permit fees**.

In outline, LEXIS works out the fee for each scale line:

- at the exemption's fixed rate, when the exemption sets one;
- for coastal timber, from the average market value for the species and
  grade and the fee in lieu percentage, plus the multiplication factor for
  the region where one applies;
- at $1 per cubic metre for interior timber.

A permit with a Canadian destination shows no fee amount. The average
market values, multiplication factors and fee in lieu percentage are set by
an Administrator.

<!-- roles: administrator -->
See [Administration](08-administration.md).
<!-- /roles -->

<!-- roles: administrator, application-approver -->
To replace the calculated total, select **Edit fee override**, set
**Override fees?** to **Yes**, and enter the **Override fee (CAD)** and an
**Override comment**. The override can be changed only while the permit is
**Active**.

For an interior permit, select **Edit receipt number** to record the
prepaid fee receipt. If the permit has an application and no **Issued
date** yet, entering the receipt number sets the **Issued date** to today.
<!-- /roles -->

<!-- roles: administrator, application-approver -->
### Complete a permit

1. On the **Permit** tab, select **Edit permit details**.
2. Set **Status** to **Complete**.
3. Enter the **Issued date** and check the **Expiry date**. A Ministerial
   permit can't expire after its exemption.
4. Select **Save changes**. If LEXIS names another tab, complete its
   required fields and save again. If the permit still needs an
   application, package or scale line, the message lists what is missing.
5. In **Email permit … approval?**, check the **Applicant email address**
   and select **Send approval**, or close the dialog to skip the email.

To be completed, a permit needs at least one application, package and
scale line, a submit date that isn't in the future, and an issued date on
or after it. A Blanket OIC permit also needs request pieces and volume
above zero.

Completing the permit creates its invoice and fixes its volume and pieces.
If the invoice can't be created, nothing is saved and the permit stays as
it was. An application becomes **Permitted** when it is added to a
Ministerial permit, or when its Order in Council permit is completed.

> For an Interior permit with no receipt, LEXIS asks **Save as Payment
> pending?** Choose **Cancel** to keep the saved status. You can add a
> receipt on **Fees** later and save it separately. Choose **Save as
> Payment pending** to put the permit in that status. When payment
> arrives, enter the **Receipt number** and choose **Complete** again.

After completion, the notice above the tabs gives the permit number and
says whether the confirmation email was sent.

The approval email goes from the export mailbox for the permit's region to
the address you confirm. It gives the permit number and lists its packages.

### Cancel, reopen or replace a permit

Change the **Status** in **Edit permit details**.

- **Cancelled** cancels every active invoice for the permit. Its Permitted
  applications normally go back to **Exempted**. Shipping and documents can
  still be changed on a cancelled permit, except the port of export.
- **Active**, from Complete or Payment pending, also cancels the active
  invoices and reopens the permit for changes.
- A Cancelled or Expired permit can't be set back to Active.
- To replace an issued permit, set it back to **Active**, make the
  correction and complete it again. The new invoice replaces the earlier
  one.
<!-- /roles -->

### Follow the invoices

The **GBMS** tab lists the permit's invoice history: **GBMS invoice
number**, **Cancelled by invoice**, **Replaced by invoice**, **Invoice
amount**, **Printed date**, **Entry date** and **Update date**. Invoices are
never entered by hand: they follow the permit's status.

![A permit's GBMS tab](images/05-permit-invoices.png)

### Print a permit

Select **Download PDF** at the top of a **Complete** permit. The PDF opens
in a new tab, where you can save or print it. It has the permit on the first
page and the detailed summary by timber mark on the second.

<!-- roles: administrator, application-approver -->
### What clients can change

- A client can change an **Active** permit and send a new review request.
- On a **Complete** permit a client can still change the shipping details,
  except the port of export, and download the permit again.
- A client can't change the dates, the fee or the receipt number. A client
  can change the status only of a **Payment pending** permit.
<!-- /roles -->

### Documents

<!-- roles: administrator -->
Add documents from the **Documents** tab. An Administrator can delete a
document at any status.
<!-- /roles -->

<!-- roles: application-approver -->
Add documents from the **Documents** tab. You can delete one while the
permit is **Active** or **Expired**.
<!-- /roles -->

<!-- roles: read-only -->
Open and download documents from the **Documents** tab.
<!-- /roles -->
