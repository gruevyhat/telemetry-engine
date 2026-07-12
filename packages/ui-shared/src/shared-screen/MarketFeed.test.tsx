// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MarketFeed } from "./MarketFeed.js";

afterEach(cleanup);

describe("MarketFeed [Spec §7.2, §14, M1-02 — hooks the feed template family into M0-07's main panel]", () => {
  it("renders one line per feed line it's given, each carrying its staleness tag inline", () => {
    render(
      <MarketFeed
        lines={[
          "machine parts at Regina: Cr410. Current price. You are standing in this market.",
          "ore at Vantage: Cr188, 4 weeks stale. That was the price 4 weeks ago, not today.",
        ]}
      />,
    );

    const items = screen.getAllByTestId(/^feed-line-/);
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("Current price");
    expect(items[1]!.textContent).toContain("4 weeks stale");
  });

  it("has no prop to hide the staleness tag (Do-not: tags always shown, not a toggle)", () => {
    // MarketFeedProps intentionally has only `lines` (already-rendered strings) — there is no
    // separate staleness field or show/hide flag for a caller to strip before display.
    render(<MarketFeed lines={["good at hex: Cr1, 1 week stale. That was the price 1 week ago, not today."]} />);
    expect(screen.getByTestId("feed-line-0").textContent).toContain("stale");
  });
});
