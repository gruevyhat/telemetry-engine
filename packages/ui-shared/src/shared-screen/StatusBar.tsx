import { TYPE_FLOOR_PX } from "./styles.js";

/**
 * [rulebook section 3.1] "Status bar (top): ship funds, the Obligation countdown, current hex and
 * world, fuel, hold/berth state." funds/obligationDays are meant to come from the M0-03
 * projections (fundsProjection, clocksProjection). The caller derives them and passes plain
 * values in, since this component is presentation-only. hex/fuelTons/holdState have no
 * projection yet, so they're plain props for now too.
 */
export interface StatusBarData {
  funds: number;
  obligationDays: number;
  hex: string;
  fuelTons: number;
  holdState: string;
}

export function StatusBar({ funds, obligationDays, hex, fuelTons, holdState }: StatusBarData) {
  return (
    <div
      role="status"
      data-testid="status-bar"
      style={{
        alignItems: "center",
        borderBottom: "1px solid #5f6368",
        display: "flex",
        flexWrap: "wrap",
        fontSize: `${TYPE_FLOOR_PX}px`,
        gap: "1rem",
        justifyContent: "space-between",
        padding: "0.75rem 1rem",
      }}
    >
      {/* Pinned locale: funds must format identically on every machine (Spec §21.3). */}
      <span data-testid="status-funds">Cr{funds.toLocaleString("en-US")}</span>
      <span data-testid="status-obligation">Obligation {obligationDays}d</span>
      <span data-testid="status-hex">{hex}</span>
      <span data-testid="status-fuel">{fuelTons}t fuel</span>
      <span data-testid="status-hold">{holdState}</span>
    </div>
  );
}
