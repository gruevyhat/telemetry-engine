import { describe, expect, it } from "vitest";
import { checkPrBody, REQUIRED_SECTIONS } from "../check-pr-body.mjs";

const COMPLETE_BODY = REQUIRED_SECTIONS.map((section) => `${section}\ncontent\n`).join("\n");

describe("checkPrBody", () => {
  it("accepts a body containing every required section", () => {
    expect(checkPrBody(COMPLETE_BODY)).toEqual({ ok: true, missing: [] });
  });

  it("rejects a body missing a required section", () => {
    const incomplete = COMPLETE_BODY.replace("## Appendix A impact\ncontent\n", "");
    const result = checkPrBody(incomplete);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("## Appendix A impact");
  });

  it("rejects an empty body", () => {
    const result = checkPrBody("");
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(REQUIRED_SECTIONS);
  });
});
