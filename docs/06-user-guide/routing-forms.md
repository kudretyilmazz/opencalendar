# Routing Forms

Ask qualifying questions and automatically route visitors to the right event type, an external URL, or a message.

## Create a routing form

1. Click **Routing forms** in the menu.
2. Click **New form**.
3. Enter a **Name** (e.g., "Inquiry form").
4. Choose the **Owner**: **Me**, or a team you're an admin or owner of. A team form is managed by the team's admins.
5. Add questions, rules and a fallback (see below).
6. Click **Save routing form**.

The form is live at `/forms/{id}` while **Accepting responses** is ticked.

## Add questions

Questions are the fields visitors fill in.

1. Open the form.
2. Choose a type in **Add a question** and click **Add question**: Text, Email, Phone, Number, Dropdown, Multiple choice (checkboxes), or Single choice (radio buttons).
3. Enter the **Question** (shown to visitors).
4. Check the **Identifier** (lowercase letters, digits and underscores). It's used in rules, prefill and URL parameters.
5. For choice types, enter the **Options (one per line)**.
6. Tick **Required** if visitors must answer it.
7. Click **Save routing form**.

A form can have up to 50 questions.

## Add routing rules

Rules check the answers and send the visitor to an event type, an external URL, or a message.

1. Open the form.
2. Go to **Routing rules** and click **Add rule**.
3. Under **When**, choose **All of these match (AND)** or **Any of these matches (OR)**.
4. Add conditions: pick a **Question**, a **Condition** and a **Value**. Click **Add condition** for more. Example: "Company size is Enterprise AND Budget is greater than 50000".
5. Under **Then route to**, choose **An event type**, **An external URL** (https:// only) or **A custom message**.
6. Click **Save routing form**.

Rules are checked from top to bottom; the first one that matches decides where the visitor goes. Use the arrows to reorder rules. If no rule matches, the **Fallback** is used.

### Conditions

- **is** / **is not** — Exact match.
- **contains** — The answer contains the text (text, email and phone questions).
- **is one of** — The answer matches one of several values (one per line).
- **is greater than** / **is less than** / **is between** — Number comparison (number questions).

### Set a fallback

Every form has a fallback: where visitors go when no rule matches. New forms show the message "Thanks! We will get back to you soon."

1. Open the form.
2. Go to **Fallback**.
3. Under **Route to**, choose an event type, an external URL or a custom message.
4. Click **Save routing form**.

## Use a routing form

The form's page in your dashboard shows its **Public link**, **Embed** code and **Headless routing** URL.

### Public link

Share the form link: `/forms/{id}`. Visitors fill it in, rules are evaluated, and they're routed to their destination.

### Embed in a website

Use the embed script (see [Embedding and integrations](./embedding-and-integrations.md)) to place the form on your website. Copy the snippet from **Embed** on the form's page.

### Headless URL

Route visitors without showing the form. Answers are passed as URL parameters named after the question identifiers; the response is stored and the visitor is redirected straight to the target.

Example: `/forms/{id}/route?company_size=Enterprise&budget=60000`.

If the answers aren't valid, the visitor sees the form with the answers filled in. For a message target, the form page shows the message.

## Prefill the booking form

When a rule routes to an event type, answers are passed on to the booking page automatically: an answer is prefilled into the booking question with the same identifier. Questions with the identifiers `name` and `email` prefill the booker's name and email.

Example: if the routing form has a question with the identifier `company` and the event type has a booking question with the identifier `company`, the visitor's answer is already filled in when they reach the booking form.

The booking is linked to the form response.

## View responses

1. Click **Routing forms** → **Responses** next to your form (or open the form and click **Responses**).

You'll see a table with:
- The **Time** of each submission (UTC).
- Each question's answer.
- **Matched** — the rule that matched (e.g., "Rule 2") or "Fallback", and how many rules were evaluated.
- **Target** — where the visitor was sent.

### CSV export

Click **Download CSV** to download all responses. The file has the submission time, one column per question identifier, the matched rule, the evaluation trace and the target.

## Manage routing forms

From the form's page:

- **Edit** — Change the name, description, questions, rules, or fallback, then click **Save routing form**.
- **Accepting responses** — Untick to turn the form off; its link and headless URL stop working. Tick it again to turn it back on.
- **Responses** — View submissions and download them as CSV.
- **Delete routing form** — Deletes the form and all of its responses.

## Limitations

- Routing forms have no CAPTCHA.
- External URL targets must be https://.
- Each form response can lead to one booking.
