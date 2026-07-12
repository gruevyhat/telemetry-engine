// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PhaseTrack } from "./PhaseTrack.js";

describe("PhaseTrack [rulebook section 3.1]", () => {
  it("renders the four turn beats and marks the live beat", () => {
    render(<PhaseTrack currentSlot="COMMS" />);

    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByTestId("beat-DOCKSIDE").textContent).toBe("DOCKSIDE");
    expect(screen.getByTestId("beat-COMMS").getAttribute("aria-current")).toBe("step");
    expect(screen.getByTestId("beat-TRANSIT").textContent).toBe("TRANSIT");
    expect(screen.getByTestId("beat-ARRIVAL").textContent).toBe("ARRIVAL");
    expect(screen.queryByTestId("beat-DOWNTIME")).toBeNull();
  });
});
