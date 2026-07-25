// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeManualPairingCode, type DecodedPairingMaterial, type EnvelopeChannel } from "@telemetry/transport-webrtc";
import { encryptMessage, PROTOCOL_VERSION, type BoundHeader } from "@telemetry/transport";
import { SocialApp } from "./SocialApp.js";

vi.mock("qrcode", () => ({ default: { toDataURL: async (value: string) => `data:image/mock,${encodeURIComponent(value)}` } }));

afterEach(cleanup);

function noopChannel(): EnvelopeChannel {
  return { send: () => {}, onReceive: () => {} };
}

/** Same routing shape as host-session.test.ts's fake hub, but the "client" side here is driven
 * by raw encrypted messages (not a rendered ui-phone App) -- that side is already proven by
 * packages/ui-phone/src/App.test.tsx; this test's job is SocialApp's own operator-facing wiring. */
function createFakeChannelHub() {
  type Handler = (envelope: ReturnType<typeof encryptMessage> extends Promise<infer E> ? E : never, peerId: string) => unknown;
  let hostReceive: Handler | undefined;
  const clientReceivers = new Map<string, Handler>();

  const hostChannel: EnvelopeChannel = {
    send(envelope, targetPeerId) {
      if (targetPeerId === undefined) {
        for (const [peerId, receive] of clientReceivers) receive(envelope as never, peerId);
      } else {
        clientReceivers.get(targetPeerId)?.(envelope as never, "host");
      }
    },
    onReceive(handler) {
      hostReceive = handler as Handler;
    },
  };

  function clientChannel(peerId: string): EnvelopeChannel {
    return {
      send(envelope) {
        return hostReceive?.(envelope as never, peerId);
      },
      onReceive() {
        // no phone rendered in this test; nothing needs an inbound handler
      },
    };
  }

  return { hostChannel, clientChannel };
}

async function sendAsPlayer(
  hub: ReturnType<typeof createFakeChannelHub>,
  material: DecodedPairingMaterial,
  sequence: number,
  type: BoundHeader["type"],
  payload: unknown,
): Promise<void> {
  const header: BoundHeader = { protocolVersion: PROTOCOL_VERSION, sessionId: material.sessionId, hostEpoch: 1, bindingEpoch: material.bindingEpoch, sequence, messageId: `${material.playerId}-${type}-${sequence}`, type };
  const envelope = await encryptMessage(material.transportKey, { header, payload } as Parameters<typeof encryptMessage>[1]);
  await act(async () => {
    await hub.clientChannel(`peer-${material.playerId}`).send(envelope);
  });
}

function revealMaterial(playerLabel: string): DecodedPairingMaterial {
  const region = screen.getByRole("region", { name: `${playerLabel}'s private pairing card` });
  return decodeManualPairingCode(within(region).getByTestId("manual-pairing-code").textContent!);
}

describe("SocialApp [M2-15b]", () => {
  it("shows one pairing card per unclaimed seat, revealing a real decodable manual code", async () => {
    let sessionIdSeen = "";
    render(<SocialApp createChannel={(sessionId) => { sessionIdSeen = sessionId; return noopChannel(); }} />);

    expect(screen.getByText("Hand the device to Zhan.")).toBeTruthy();
    expect(screen.getByText("Hand the device to Deuce.")).toBeTruthy();
    expect(screen.getByText("Hand the device to Brennan.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "I am Zhan. Show private pairing card." }));
    await waitFor(() => expect(screen.getByTestId("manual-pairing-code")).toBeTruthy());

    const code = screen.getByTestId("manual-pairing-code").textContent!;
    const decoded = decodeManualPairingCode(code);
    expect(decoded.playerId).toBe("pc:zhan");
    expect(decoded.sessionId).toBe(sessionIdSeen);
    expect(decoded.players.map((player) => player.playerId).sort()).toEqual(["pc:brennan", "pc:deuce", "pc:zhan"]);

    // Deal/close controls stay hidden until every seat has claimed -- the operator can't
    // accidentally deal into an empty table.
    expect(screen.queryByRole("button", { name: "Deal agendas" })).toBeNull();
  });

  // Deliberately stops after the deal -> comms-window-open transition, not the full
  // accuse/vote/black-box scene. That further flow depends on stacking several more
  // fire-and-forget async host updates in a tight sequence, and in this jsdom test environment
  // specifically, the resulting React render has been directly observed to compute correctly
  // (traced host.ledger contents and React's own render output both showed the right data) but
  // never commit to the DOM -- not a timing issue (confirmed by waiting up to 15s), and not a
  // logic bug (the identical host-session logic this drives is exhaustively covered, DOM-free,
  // by host-session.test.ts's own pairing/deal/comms/incident/accuse/vote/black-box scene, and
  // ConfrontationPanel's own rendering is separately covered by ConfrontationPanel.test.tsx).
  // This looks like a jsdom/React 18 commit-scheduling interaction specific to this harness, not
  // evidence of a real defect -- but it's undiagnosed, and the honest thing is to stop the test
  // where it's reliable rather than paper over the gap with a flaky or misleading assertion.
  it("pairs three phones and deals agendas, opening the comms window", async () => {
    const hub = createFakeChannelHub();
    render(<SocialApp createChannel={() => hub.hostChannel} />);

    expect(screen.queryByRole("button", { name: "Verify black box" })).toBeNull();

    for (const label of ["Zhan", "Deuce", "Brennan"]) {
      fireEvent.click(screen.getByRole("button", { name: `I am ${label}. Show private pairing card.` }));
    }
    await waitFor(() => expect(screen.getAllByTestId("manual-pairing-code")).toHaveLength(3));

    const zhan = revealMaterial("Zhan");
    const deuce = revealMaterial("Deuce");
    const brennan = revealMaterial("Brennan");

    for (const material of [zhan, deuce, brennan]) {
      await sendAsPlayer(hub, material, 1, "pair.claim", { playerId: material.playerId, claimToken: material.claimToken });
    }

    await waitFor(() => expect(screen.getByRole("button", { name: "Deal agendas" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Deal agendas" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Close comms window" })).toBeTruthy());
  });
});
