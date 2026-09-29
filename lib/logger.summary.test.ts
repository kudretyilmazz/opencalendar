import { describe, expect, it } from "vitest";
import { errorSummary } from "./logger";

describe("errorSummary", () => {
  it("keeps the class name and machine codes but drops the message", () => {
    const smtp = Object.assign(new Error("550 mailbox ada@example.com unavailable at smtp.secret.host"), {
      code: "EENVELOPE",
      responseCode: 550,
    });
    const summary = errorSummary(smtp);
    expect(summary).toEqual({ error: "Error", code: "EENVELOPE", responseCode: 550 });
    expect(JSON.stringify(summary)).not.toContain("ada@example.com");
  });

  it("handles non-Error values", () => {
    expect(errorSummary("boom")).toEqual({ error: "string" });
  });
});
