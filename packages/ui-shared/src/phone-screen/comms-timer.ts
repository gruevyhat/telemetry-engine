export interface CommsWindowTimer {
  remainingSeconds(): number;
  isOpen(): boolean;
  /** Host-driven countdown; a no-op once closed. */
  tick(deltaSeconds: number): void;
  /** A client's early "done" signal is a transport receipt only -- it never changes lock state. */
  acknowledge(): void;
  /** The only thing that releases the window, host-side, whether or not time remains. */
  close(): void;
}

/** [M2-12] Spec §16/screens-v2 3.1: "the host timer is authoritative... early acknowledgements
 * are accepted as transport receipts but do not close or unlock anything." Reaching zero alone
 * does not open the gate -- an explicit close() call (the host's own timer-expiry handling) does. */
export function createCommsWindowTimer(durationSeconds: number): CommsWindowTimer {
  let remaining = durationSeconds;
  let open = true;
  return {
    remainingSeconds: () => Math.max(0, remaining),
    isOpen: () => open,
    tick(deltaSeconds) {
      if (open) remaining = Math.max(0, remaining - deltaSeconds);
    },
    acknowledge() {},
    close() {
      open = false;
    },
  };
}
