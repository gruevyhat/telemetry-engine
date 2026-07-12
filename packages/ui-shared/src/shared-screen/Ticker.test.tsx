// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Fact } from "@telemetry/engine";
import { Ticker } from "./Ticker.js";

function fact(id: string, kind: string, level: "public" | "table" | "referee"): Fact {
  return {
    id,
    t: { day: 1, slot: "DOCKSIDE" },
    wall: 0,
    kind,
    actor: { kind: "referee", id: "referee" },
    payload: {},
    visibility: { level },
  };
}

describe("Ticker [rulebook section 3.1: append-only public journal]", () => {
  it("renders only public-visibility facts", () => {
    const facts: Fact[] = [
      fact("f1", "cargo.loaded", "public"),
      fact("f2", "lock.cycled", "referee"),
      fact("f3", "system.failed", "table"),
      fact("f4", "sale.settled", "public"),
    ];
    render(<Ticker facts={facts} />);

    expect(screen.getByTestId("ticker-entry-f1")).toBeTruthy();
    expect(screen.getByTestId("ticker-entry-f4")).toBeTruthy();
    expect(screen.queryByTestId("ticker-entry-f2")).toBeNull();
    expect(screen.queryByTestId("ticker-entry-f3")).toBeNull();
  });
});
