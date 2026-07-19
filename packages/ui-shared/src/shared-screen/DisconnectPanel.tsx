import { TYPE_FLOOR_PX } from "./styles.js";

export interface DisconnectPanelProps {
  readonly playerName: string;
  readonly remainingSeconds: number;
  readonly onWaitForReconnect: () => void;
  readonly onContinueByHotseat: () => void;
  readonly onExportSave: () => void;
}

function countdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

/** [M2-13] screens-v2 5: a required-seat disconnect pauses the timer; this panel offers the
 * host's three recorded continuations without ever advancing anything itself. */
export function DisconnectPanel({ playerName, remainingSeconds, onWaitForReconnect, onContinueByHotseat, onExportSave }: DisconnectPanelProps) {
  return (
    <section aria-labelledby="disconnect-heading" style={{ fontSize: `${TYPE_FLOOR_PX}px` }}>
      <h2 id="disconnect-heading">Comms paused</h2>
      <p>
        {playerName} disconnected with {countdown(remainingSeconds)} remaining.
      </p>
      <button type="button" onClick={onWaitForReconnect}>
        Wait for reconnect
      </button>
      <button type="button" onClick={onContinueByHotseat}>
        Continue by hotseat
      </button>
      <button type="button" onClick={onExportSave}>
        Export save
      </button>
    </section>
  );
}
