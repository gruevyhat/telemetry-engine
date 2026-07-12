// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  clocksProjection,
  createKindRegistry,
  createLedger,
  derive,
  fundsProjection,
  KINDS_V0,
  type GameTime,
} from "@telemetry/engine";
import { StatusBar } from "./StatusBar.js";

const T: GameTime = { day: 7, slot: "DOCKSIDE" };
const REFEREE = { kind: "referee", id: "referee" } as const;

describe("StatusBar [rulebook section 3.1]", () => {
  it("renders funds and obligation derived from the M0-03 projections, plus hex/fuel/hold", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    ledger.append({
      t: T,
      kind: "sale.settled",
      actor: REFEREE,
      payload: { lotId: "L1", amount: 169200, countDelivered: 18, buyer: "buyer" },
    });
    ledger.append({ t: T, kind: "clock.tick", actor: REFEREE, payload: { clockId: "obligation", delta: -7 } });

    const funds = derive(ledger.all(), fundsProjection);
    const obligationDays = derive(ledger.all(), clocksProjection).obligation ?? 0;

    render(<StatusBar funds={funds} obligationDays={obligationDays} hex="Vantage" fuelTons={12} holdState="18/20t" />);

    expect(screen.getByTestId("status-funds").textContent).toContain("169,200");
    expect(screen.getByTestId("status-obligation").textContent).toContain("-7");
    expect(screen.getByTestId("status-hex").textContent).toBe("Vantage");
    expect(screen.getByTestId("status-fuel").textContent).toContain("12");
    expect(screen.getByTestId("status-hold").textContent).toBe("18/20t");
  });
});
