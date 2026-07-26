import { readFileSync } from "node:fs";

const catalogSource = readFileSync(new URL("../../engine/src/ledger/kinds-v0.ts", import.meta.url), "utf8");
const definitions = new Map();
const starts = [...catalogSource.matchAll(/kind:\s*"([^"]+)"/g)];
for (let index = 0; index < starts.length; index += 1) {
  const match = starts[index];
  const segment = catalogSource.slice(match.index, starts[index + 1]?.index ?? catalogSource.length);
  const payload = segment.match(/payload:\s*\{([^}]*)\}/s)?.[1] ?? "";
  definitions.set(match[1], new Set([...payload.matchAll(/([A-Za-z][A-Za-z0-9]*):\s*f\(/g)].map((field) => field[1])));
}

export function agendaReferentialErrors(deck, frames, label) {
  const errors = [];
  const weights = Object.values(deck.tierWeights);
  if (Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) > 1e-9) errors.push(`${label}: tier weights must sum to 1`);
  const actions = new Set();
  const agendaIds = new Set();
  const checkKind = (kind, context) => { if (!definitions.has(kind)) errors.push(`${label}: ${context} references unknown kind "${kind}"`); };
  const checkSelector = (selector, context) => { for (const kind of selector?.kinds ?? []) {
    if (kind.endsWith(".*")) {
      if (![...definitions.keys()].some((candidate) => candidate.startsWith(kind.slice(0, -1)))) errors.push(`${label}: ${context} glob "${kind}" matches no registered kind`);
    } else checkKind(kind, context);
  } };
  checkSelector(deck.routineObjective.successCondition, "routine objective");
  for (const [key, template] of Object.entries(deck.templates)) {
    if (/!|…|\.\.\.|<[^>]+>|[*_#`]/.test(template) || /\b(unfortunately|sadly|amazing|just)\b/i.test(template)) errors.push(`${label}: template "${key}" is not TTS-safe MAGGIE text`);
  }
  for (const agenda of deck.agendas) {
    if (agendaIds.has(agenda.id)) errors.push(`${label}: duplicate agenda id "${agenda.id}"`);
    agendaIds.add(agenda.id);
    checkSelector(agenda.successCondition, `agenda "${agenda.id}" selector`);
    for (const action of agenda.actions) {
      if (actions.has(action.id)) errors.push(`${label}: duplicate action id "${action.id}"`);
      actions.add(action.id);
      if (!(action.labelTemplate in deck.templates)) errors.push(`${label}: action "${action.id}" references missing template "${action.labelTemplate}"`);
      for (const kind of action.target?.kinds ?? []) checkKind(kind, `action "${action.id}" target`);
      for (const proposal of action.proposals) {
        checkKind(proposal.kind, `action "${action.id}" proposal`);
        const fields = definitions.get(proposal.kind);
        for (const [field, value] of Object.entries(proposal.payload)) {
          if (fields && !fields.has(field)) errors.push(`${label}: proposal payload field "${field}" is not registered on "${proposal.kind}"`);
          if (value?.ref === "target") for (const kind of action.target?.kinds ?? []) {
            if (!definitions.get(kind)?.has(value.field)) errors.push(`${label}: target field "${value.field}" is not registered on "${kind}"`);
          }
        }
      }
      for (const implication of action.implies) checkKind(implication.kind, `action "${action.id}" implication`);
    }
  }
  for (const [tier, weight] of Object.entries(deck.tierWeights)) if (weight > 0 && !deck.agendas.some((agenda) => agenda.tier === tier)) {
    errors.push(`${label}: positive ${tier} tier weight has no agenda`);
  }
  for (const frame of frames) if (frame.claimant && !actions.has(frame.claimant.agendaActionId)) {
    errors.push(`${label}: frame "${frame.id}" claimant references unknown action "${frame.claimant.agendaActionId}"`);
  }
  return errors;
}
