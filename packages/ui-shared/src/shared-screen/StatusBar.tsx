import { TYPE_FLOOR_PX } from "./styles.js";

export interface StatusBarData {
  funds: number;
  obligationDays: number;
  hex: string;
  fuelTons: number;
  holdState: string;
}

export function StatusBar(_props: StatusBarData) {
  return <div role="status" data-testid="status-bar" style={{ fontSize: `${TYPE_FLOOR_PX}px` }} />;
}
