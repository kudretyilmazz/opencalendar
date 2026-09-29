import { expect, test } from "@playwright/test";
import { configureProfile, createEventType, expectAccessible, firstSlotButton, guardBrowserErrors, pickFirstAvailableDay, queryValue, pickOption, signUpVerified } from "./helpers";
import { uniqueEmail } from "./mailpit";

/**
 * Routing forms end to end (RTE-001…006): build a form with a rule and a fallback, route a
 * visitor to a prefilled booking page and book (the response is linked to the booking), show the
 * fallback message, route headlessly from URL parameters, and export responses as CSV.
 */

guardBrowserErrors();

test("routing form: rule to a prefilled booking page, fallback message, headless and CSV", async ({ page, browser }) => {
  test.setTimeout(90_000);
  await signUpVerified(page, "Rita Router", "router");
  const username = `rita${Date.now().toString(36)}`;
  await configureProfile(page, username, "UTC");
  await createEventType(page, "Sales demo", { minNotice: "0" });
  await page.getByRole("link", { name: "Sales demo", exact: true }).click();
  await page.getByRole("button", { name: "Add question" }).click();
  await page.getByLabel("Question", { exact: true }).fill("Company");
  await page.getByLabel("Identifier").fill("company");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Event type saved.")).toBeVisible();

  // Builder (RTE-001/002/003)
  await page.goto("/routing-forms/new");
  await page.getByLabel("Name", { exact: true }).fill("Qualify");
  await pickOption(page, page.locator("#newFieldType"), "Text");
  await page.getByRole("button", { name: "Add question" }).click();
  await page.locator("#f-label-0").fill("Company");
  await page.locator("#f-key-0").fill("company");
  await page.getByRole("button", { name: "Add rule" }).click();
  await pickOption(page, page.locator("#rule-0-c0-field"), "Company");
  await pickOption(page, page.locator("#rule-0-c0-op"), "contains");
  await page.locator("#rule-0-c0-value").fill("acme");
  await pickOption(page, page.locator("#rule-0-action-event"), "Sales demo (/sales-demo)");
  await pickOption(page, page.locator("#fallback-kind"), "A custom message");
  await page.locator("#fallback-message").fill("Thanks! We will email you.");
  await page.getByRole("button", { name: "Save routing form" }).click();
  await expect(page).toHaveURL(/\/routing-forms\/(?!new$)[^/]+$/);
  const formId = new URL(page.url()).pathname.split("/").at(-1)!;
  await expectAccessible(page);

  // A matching visitor lands on the prefilled booking page and books (RTE-004).
  const visitor = await (await browser.newContext({ timezoneId: "UTC" })).newPage();
  await visitor.goto(`/forms/${formId}`);
  await expectAccessible(visitor);
  await visitor.getByLabel("Company").fill("ACME Corp");
  await visitor.getByRole("button", { name: "Continue" }).click();
  await expect(visitor).toHaveURL(new RegExp(`/${username}/sales-demo\\?.*routing=`));
  await pickFirstAvailableDay(visitor);
  await (await firstSlotButton(visitor)).click();
  await expect(visitor.getByLabel("Company")).toHaveValue("ACME Corp");
  const email = uniqueEmail("routed");
  await visitor.getByLabel("Your name").fill("Routed Visitor");
  await visitor.getByLabel("Email").fill(email);
  await visitor.getByRole("button", { name: "Confirm booking" }).click();
  await expect(visitor.getByRole("heading", { name: "You are scheduled" })).toBeVisible();
  const linked = await queryValue<string>(
    `SELECT b.routing_form_response_id FROM booking b JOIN attendee a ON a.booking_id = b.id WHERE a.email = $1`,
    [email],
  );
  expect(linked).toBeTruthy();

  // Fallback (RTE-003)
  await visitor.goto(`/forms/${formId}`);
  await visitor.getByLabel("Company").fill("Globex");
  await visitor.getByRole("button", { name: "Continue" }).click();
  await expect(visitor.getByText("Thanks! We will email you.")).toBeVisible();

  // Headless routing (RTE-006)
  await visitor.goto(`/forms/${formId}/route?company=acme%20inc`);
  await expect(visitor).toHaveURL(new RegExp(`/${username}/sales-demo\\?`));

  // Responses and CSV (RTE-005)
  await page.goto(`/routing-forms/${formId}/responses`);
  await expect(page.getByText("ACME Corp")).toBeVisible();
  await expect(page.getByText("Globex")).toBeVisible();
  await expectAccessible(page);
  const csv = await page.request.get(`/api/routing-forms/${formId}/responses`);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const body = await csv.text();
  expect(body).toContain("ACME Corp");
  expect(body).toContain("fallback");
  await visitor.context().close();
});
