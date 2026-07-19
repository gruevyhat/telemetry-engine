import { existsSync, readFileSync, readdirSync } from "node:fs";
import Ajv from "ajv";
import { agendaReferentialErrors } from "../src/agenda-lint.js";

const contentDir = new URL("../../../content/", import.meta.url);
const framesDir = new URL("frames/", contentDir);
const decksDir = new URL("decks/", contentDir);
const phaseSchemaUrl = new URL("../../engine/src/phases/phase-script.schema.json", import.meta.url);
const templatesSchemaUrl = new URL("../../engine/src/phases/announce-templates.schema.json", import.meta.url);
const incidentFrameSchemaUrl = new URL("../../engine/src/generate/incident-frame.schema.json", import.meta.url);
const slotTablesSchemaUrl = new URL("../../engine/src/generate/slot-tables.schema.json", import.meta.url);
const agendaDeckSchemaUrl = new URL("../../engine/src/agenda/agenda-deck.schema.json", import.meta.url);

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

function semanticErrors(script, templates, label) {
  const errors = [];
  const steps = new Map();
  for (const step of script.steps) {
    if (steps.has(step.id)) errors.push(`${label}: duplicate step id "${step.id}"`);
    steps.set(step.id, step);
  }
  if (!steps.has(script.start)) errors.push(`${label}: unknown start step "${script.start}"`);

  for (const step of script.steps) {
    const targets = typeof step.next === "string" ? [step.next] : Object.values(step.next);
    if (step.check) targets.push(step.check.onSuccess, step.check.onFail);
    for (const target of targets) {
      if (!steps.has(target)) errors.push(`${label}: step "${step.id}" references unknown step "${target}"`);
    }
    if (step.kind === "announce" && !step.automatic && !step.render) {
      errors.push(`${label}: announce step "${step.id}" has no render key`);
    }
    if (step.render && !(step.render in templates)) {
      errors.push(`${label}: render key "${step.render}" has no announce template`);
    }
  }

  const unsafe = /!|…|\.\.\.|<[^>]+>|[*_#`]/;
  const banned = /\b(unfortunately|sadly|amazing|just)\b/i;
  for (const [key, text] of Object.entries(templates)) {
    if (unsafe.test(text)) errors.push(`${label}: template "${key}" is not TTS-safe`);
    if (banned.test(text)) errors.push(`${label}: template "${key}" uses banned MAGGIE diction`);
  }
  return errors;
}

/**
 * [Spec §19 referential pass: "every slot/frame/... reference exists"] The one cross-frame check
 * schema validation alone can't do: two frames sharing an id would silently collide in
 * generate/frame.ts's cooldown state (keyed by id) and in a future composer's pool lookup.
 */
function deckReferentialErrors(frames, label) {
  const errors = [];
  const seenIds = new Set();
  for (const frame of frames) {
    if (seenIds.has(frame.id)) {
      errors.push(`${label}: duplicate frame id "${frame.id}"`);
    }
    seenIds.add(frame.id);
  }
  return errors;
}

if (!existsSync(framesDir)) {
  console.error("content-lint: content/frames is missing.");
  process.exit(1);
}

const ajv = new Ajv({ allErrors: true });
const validateScript = ajv.compile(readJson(phaseSchemaUrl));
const validateTemplates = ajv.compile(readJson(templatesSchemaUrl));
const validateFrame = ajv.compile(readJson(incidentFrameSchemaUrl));
const validateSlotTables = ajv.compile(readJson(slotTablesSchemaUrl));
const validateAgendaDeck = ajv.compile(readJson(agendaDeckSchemaUrl));
const failures = [];
let scriptCount = 0;
let templateCount = 0;
let frameCount = 0;
let slotTableCount = 0;
let agendaCount = 0;

for (const entry of readdirSync(framesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const frameDir = new URL(`${entry.name}/`, framesDir);
  const turnUrl = new URL("turn.json", frameDir);
  if (!existsSync(turnUrl)) continue;

  const label = `content/frames/${entry.name}`;
  const templatesUrl = new URL("announce-templates.json", frameDir);
  if (!existsSync(templatesUrl)) {
    failures.push(`${label}: announce-templates.json is missing`);
    continue;
  }

  try {
    const script = readJson(turnUrl);
    const templates = readJson(templatesUrl);
    const scriptValid = validateScript(script);
    if (!scriptValid) {
      failures.push(`${label}/turn.json: ${ajv.errorsText(validateScript.errors)}`);
    }
    const templatesValid = validateTemplates(templates);
    if (!templatesValid) {
      failures.push(`${label}/announce-templates.json: ${ajv.errorsText(validateTemplates.errors)}`);
    }
    if (scriptValid && templatesValid) {
      failures.push(...semanticErrors(script, templates, label));
      scriptCount += 1;
      templateCount += Object.keys(templates).length;
    }
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (existsSync(decksDir)) {
  for (const entry of readdirSync(decksDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const deckDir = new URL(`${entry.name}/`, decksDir);
    const framesUrl = new URL("frames.json", deckDir);
    if (!existsSync(framesUrl)) continue;

    const label = `content/decks/${entry.name}`;
    try {
      const frames = readJson(framesUrl);
      if (!Array.isArray(frames)) {
        failures.push(`${label}/frames.json: expected an array of incident frames`);
        continue;
      }
      let deckValid = true;
      for (const frame of frames) {
        if (!validateFrame(frame)) {
          deckValid = false;
          failures.push(`${label}/frames.json (frame "${frame && frame.id}"): ${ajv.errorsText(validateFrame.errors)}`);
        }
      }
      if (deckValid) {
        const referentialErrors = deckReferentialErrors(frames, `${label}/frames.json`);
        if (referentialErrors.length > 0) {
          deckValid = false;
          failures.push(...referentialErrors);
        }
      }

      const slotTablesUrl = new URL("slot-tables.json", deckDir);
      let slotTablesValid = true;
      if (existsSync(slotTablesUrl)) {
        const slotTables = readJson(slotTablesUrl);
        slotTablesValid = validateSlotTables(slotTables);
        if (!slotTablesValid) {
          failures.push(`${label}/slot-tables.json: ${ajv.errorsText(validateSlotTables.errors)}`);
        }
      }

      const agendasUrl = new URL("agendas.json", deckDir);
      let agendasValid = true;
      if (existsSync(agendasUrl)) {
        const agendas = readJson(agendasUrl);
        agendasValid = validateAgendaDeck(agendas);
        if (!agendasValid) failures.push(`${label}/agendas.json: ${ajv.errorsText(validateAgendaDeck.errors)}`);
        else {
          const agendaErrors = agendaReferentialErrors(agendas, frames, `${label}/agendas.json`);
          if (agendaErrors.length > 0) { agendasValid = false; failures.push(...agendaErrors); }
          else agendaCount += agendas.agendas.length;
        }
      } else if (frames.some((frame) => frame.claimant)) {
        agendasValid = false;
        failures.push(`${label}: frames with agenda claimants require agendas.json`);
      }

      if (deckValid && slotTablesValid && agendasValid) {
        frameCount += frames.length;
        if (existsSync(slotTablesUrl)) {
          slotTableCount += Object.keys(readJson(slotTablesUrl)).length;
        }
      }
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

const deckSummary = frameCount > 0 ? ` and ${frameCount} incident frame${frameCount === 1 ? "" : "s"} (${slotTableCount} named slot table${slotTableCount === 1 ? "" : "s"})` : "";
const agendaSummary = agendaCount > 0 ? ` and ${agendaCount} agenda${agendaCount === 1 ? "" : "s"}` : "";
console.log(
  `content-lint: ${scriptCount} phase script${scriptCount === 1 ? "" : "s"} and ${templateCount} announce templates valid${deckSummary}${agendaSummary}.`,
);
