export interface CommsWindowTimer {
  remainingSeconds(): number;
  isOpen(): boolean;
  isPaused(): boolean;
  /** Host-driven countdown; a no-op once closed or while paused. */
  tick(deltaSeconds: number): void;
  /** A client's early "done" signal is a transport receipt only -- it never changes lock state. */
  acknowledge(): void;
  /** [M2-13] A required seat's disconnect: freezes the exact remaining duration (screens-v2 5's
   * "same remaining duration" on reconnect) rather than losing time to the outage. */
  pause(): void;
  /** The seat reconnects; ticking resumes from the frozen remaining duration. A no-op after close. */
  resume(): void;
  /** The only thing that releases the window, host-side, whether or not time remains, paused or not. */
  close(): void;
}

/** [M2-12/M2-13] Spec §16/screens-v2 3.1: "the host timer is authoritative... early
 * acknowledgements are accepted as transport receipts but do not close or unlock anything."
 * Reaching zero alone does not open the gate -- an explicit close() call (the host's own
 * timer-expiry handling) does. screens-v2 5: a disconnect pauses rather than closes; reconnect
 * resumes counting from the same frozen remaining duration. */
export function createCommsWindowTimer(durationSeconds: number): CommsWindowTimer {
  let remaining = durationSeconds;
  let open = true;
  let paused = false;
  return {
    remainingSeconds: () => Math.max(0, remaining),
    isOpen: () => open,
    isPaused: () => paused,
    tick(deltaSeconds) {
      if (open && !paused) remaining = Math.max(0, remaining - deltaSeconds);
    },
    acknowledge() {},
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    close() {
      open = false;
    },
  };
}
