import {
  clocksProjection,
  createKindRegistry,
  createLedger,
  derive,
  fundsProjection,
  KINDS_V0,
  type GameTime,
} from "@telemetry/engine";
import { Interstitial, SharedScreen } from "./shared-screen/index.js";

const DEMO_TIME: GameTime = { day: 7, slot: "DOCKSIDE" };
const REFEREE = { kind: "referee", id: "referee" } as const;
const ZHAN = { kind: "pc", id: "pc:zhan" } as const;

function createDemoLedger() {
  const ledger = createLedger(createKindRegistry(KINDS_V0));
  ledger.append({
    t: DEMO_TIME,
    kind: "cargo.loaded",
    actor: ZHAN,
    payload: { lotId: "L1", tons: 20, manifestId: "M1", bay: "aft" },
  });
  ledger.append({
    t: DEMO_TIME,
    kind: "sale.settled",
    actor: REFEREE,
    payload: { lotId: "L1", amount: 169200, countDelivered: 18, buyer: "Vantage Exchange" },
  });
  ledger.append({ t: DEMO_TIME, kind: "clock.tick", actor: REFEREE, payload: { clockId: "obligation", delta: -7 } });
  ledger.append({
    t: { day: 7, slot: "COMMS" },
    kind: "agenda.actionTaken",
    actor: ZHAN,
    payload: { playerId: "pc:zhan", actionId: "skim-crate" },
    visibility: { level: "private", playerIds: ["pc:zhan"] },
  });
  return ledger;
}

export function App() {
  const ledger = createDemoLedger();
  const facts = ledger.all();
  const clocks = derive(facts, clocksProjection);
  const status = {
    funds: derive(facts, fundsProjection),
    obligationDays: clocks.obligation ?? 0,
    hex: "Vantage",
    fuelTons: 12,
    holdState: "18/20t",
  };

  return (
    <>
      <SharedScreen status={status} currentSlot="DOCKSIDE" facts={facts}>
        <p>Dockside systems are open. Awaiting crew action.</p>
      </SharedScreen>
      <Interstitial playerName="Zhan" visibleFacts={ledger.visibleTo({ scope: "private", playerId: "pc:zhan" })} />
    </>
  );
}
