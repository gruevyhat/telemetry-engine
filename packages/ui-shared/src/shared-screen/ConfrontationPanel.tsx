import { useState } from "react";
import type { Fact } from "@telemetry/engine";

export interface ConfrontationPanelProps {
  /** The component defensively keeps only public facts even when a host accidentally supplies
   * its full ledger. Private/referee facts therefore cannot enter the render tree. */
  facts: readonly Fact[];
  remainingSeconds: number;
  playerLabels: Readonly<Record<string, string>>;
  accusationTargets: readonly string[];
  onAccuse: (targetId: string) => void;
}

function latest(facts: readonly Fact[], kind: string): Fact | undefined {
  return [...facts].reverse().find((fact) => fact.kind === kind);
}

function displayName(id: string, labels: Readonly<Record<string, string>>): string {
  return labels[id] ?? id;
}

function countdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function countWord(value: number, capitalized = false): string {
  const words = ["zero", "one", "two", "three", "four", "five"];
  const word = words[value] ?? String(value);
  return capitalized ? `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}` : word;
}

/** [M2-08, INV-12/13] A public projection of confrontation state. It renders structured fact
 * fields and emits one typed command callback; it neither parses discussion nor holds a Ledger,
 * so React has no write path. Remounting with the same facts reconstructs the same result. */
export function ConfrontationPanel({ facts, remainingSeconds, playerLabels, accusationTargets, onAccuse }: ConfrontationPanelProps) {
  const publicFacts = facts.filter((fact) => fact.visibility.level === "public");
  const opened = latest(publicFacts, "confrontation.opened");
  const [selectedTarget, setSelectedTarget] = useState(accusationTargets[0] ?? "");

  if (!opened) {
    return (
      <section aria-labelledby="confrontation-heading">
        <h2 id="confrontation-heading">Confrontation</h2>
        <label>
          Accusation target
          <select aria-label="accusation target" value={selectedTarget} onChange={(event) => setSelectedTarget(event.target.value)}>
            {accusationTargets.map((id) => <option key={id} value={id}>{displayName(id, playerLabels)}</option>)}
          </select>
        </label>
        <button type="button" disabled={!selectedTarget} onClick={() => onAccuse(selectedTarget)}>Accuse</button>
      </section>
    );
  }

  const declarer = typeof opened.payload.declarer === "string" ? opened.payload.declarer : opened.actor.id;
  const target = typeof opened.payload.target === "string" ? opened.payload.target : "unknown target";
  const topic = `burn:${target}`;
  const vote = [...publicFacts].reverse().find((fact) => fact.kind === "vote.recorded" && fact.payload.topic === topic);
  const eligible = vote && Array.isArray(vote.payload.eligiblePlayerIds) ? vote.payload.eligiblePlayerIds.filter((id): id is string => typeof id === "string") : [];
  const ballots = vote?.payload.ballots && typeof vote.payload.ballots === "object" && !Array.isArray(vote.payload.ballots)
    ? vote.payload.ballots as Readonly<Record<string, unknown>> : {};
  const status = vote && typeof vote.payload.status === "string" ? vote.payload.status : "open";
  const linkedResolution = vote ? publicFacts.find((fact) => fact.kind === "confrontation.resolved" && fact.causes?.includes(vote.id)) : undefined;
  const linkedEnvelope = vote ? publicFacts.find((fact) => fact.kind === "envelope.opened" && fact.causes?.includes(vote.id) && fact.payload.playerId === target) : undefined;
  const yes = Object.values(ballots).filter((value) => value === true).length;
  const no = Object.values(ballots).filter((value) => value === false).length;

  let result: string | undefined;
  if (status === "carried" && linkedResolution?.payload.outcome === "burned" && linkedEnvelope) {
    result = `The vote carries. ${displayName(target, playerLabels)} is burned. Envelope: ${String(linkedEnvelope.payload.contents)}.`;
  } else if (status === "failed" && linkedResolution?.payload.outcome === "failed") {
    result = `The vote fails. ${countWord(yes, true)} yes, ${countWord(no)} no.`;
  }

  return (
    <section aria-labelledby="confrontation-heading">
      <h2 id="confrontation-heading">Confrontation</h2>
      <time aria-label="confrontation countdown">{countdown(remainingSeconds)}</time>
      <p>{displayName(declarer, playerLabels)} accuses {displayName(target, playerLabels)}.</p>
      {eligible.length > 0 ? (
        <ul aria-label="confrontation ballots">
          {eligible.map((playerId) => (
            <li key={playerId} data-testid={`ballot-${playerId}`}>
              {displayName(playerId, playerLabels)}: {ballots[playerId] === true ? "Yes" : ballots[playerId] === false ? "No" : "Waiting"}
            </li>
          ))}
        </ul>
      ) : <p>Explicit actions and votes are logged.</p>}
      {result ? <p data-testid="confrontation-result">{result}</p> : null}
    </section>
  );
}
