import { existsSync, readFileSync, readdirSync } from "node:fs";
import Ajv from "ajv";

const contentDir = new URL("../../../content/", import.meta.url);
const framesDir = new URL("frames/", contentDir);
const phaseSchemaUrl = new URL("../../engine/src/phases/phase-script.schema.json", import.meta.url);
const templatesSchemaUrl = new URL("../../engine/src/phases/announce-templates.schema.json", import.meta.url);

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

if (!existsSync(framesDir)) {
  console.error("content-lint: content/frames is missing.");
  process.exit(1);
}

const ajv = new Ajv({ allErrors: true });
const validateScript = ajv.compile(readJson(phaseSchemaUrl));
const validateTemplates = ajv.compile(readJson(templatesSchemaUrl));
const failures = [];
let scriptCount = 0;
let templateCount = 0;

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

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log(
  `content-lint: ${scriptCount} phase script${scriptCount === 1 ? "" : "s"} and ${templateCount} announce templates valid.`,
);
