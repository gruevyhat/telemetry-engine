export interface CommsAction {
  readonly actionId: string;
  readonly templateKey: string;
}

export interface CommsScreenProps {
  readonly remainingSeconds: number;
  readonly actions: readonly CommsAction[];
  readonly onQueueAction: (actionId: string) => void;
}

function countdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

/**
 * [M2-12, INV-13] Every phone renders this same shell regardless of agenda status; only the
 * action-menu region's presence differs, driven entirely by whether the caller's authorized
 * `actions` list (from the engine's presentation projector) is empty. There is no other branch
 * a glance at the phone or the shared screen could use to tell a routine client from a holder.
 */
export function CommsScreen({ remainingSeconds, actions, onQueueAction }: CommsScreenProps) {
  return (
    <section aria-labelledby="comms-heading" data-testid="comms-shell">
      <h2 id="comms-heading">Comms</h2>
      <time aria-label="comms countdown">{countdown(remainingSeconds)}</time>
      {actions.length > 0 ? (
        <ul aria-label="comms action menu">
          {actions.map((action) => (
            <li key={action.actionId}>
              <button type="button" onClick={() => onQueueAction(action.actionId)}>
                {action.templateKey}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>Private traffic. Nothing to queue this window.</p>
      )}
      <p>Window remains locked.</p>
    </section>
  );
}
