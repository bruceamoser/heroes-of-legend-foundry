/** Reproduce the immutable v2.7.1 correction baseline; never sample live world Items. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ABILITY_RULE_PATHS, abilityRuleFingerprint, abilityRuleValue } from "../src/rules/ability-rule-update.mjs";
const root = new URL("../",import.meta.url);
const profiles = JSON.parse(await readFile(new URL("scripts/content/inline-roll-profiles.json",root)));
const ids = [...new Set([...Object.keys(profiles), "ability-catch-the-mechanism", "ability-steel-at-the-wrist", "ability-snare-the-missile", "ability-thought-before-the-blow"])].sort();
const native = JSON.parse(await readFile(new URL("scripts/content/ability-update-native-v14.json",root)));
const manifest = {baselineVersion:"2.7.1",systemCommit:"0d8f062d81d2e818bfa39bae7eeab03ec756ff86",abilities:{}};
for (const id of ids) {
  const bytes = execFileSync("git",["show",`${manifest.systemCommit}:content/packs/abilities/${id}.json`],{cwd:fileURLToPath(root)});
  const source = JSON.parse(bytes.toString("utf8"));
  const canonical = native.abilities[id];
  if (native.baselineSystemCommit !== manifest.systemCommit || native.foundry !== "14.367" || native.repeatedSaves !== 2 || native.disposableActorDeleted !== true || canonical?.rawItemSha256 !== createHash("sha256").update(bytes).digest("hex") || JSON.stringify(canonical.source) !== JSON.stringify(source.flags["heroes-of-legend"].source))
    throw new Error(`Native correction evidence does not match immutable source: ${id}`);
  const fields = {};
  for (const path of ABILITY_RULE_PATHS) fields[path] = await abilityRuleFingerprint(abilityRuleValue(source,path));
  manifest.abilities[id] = {source:source.flags["heroes-of-legend"].source,fields, nativeFields:canonical.fields};
}
const output = new URL("static/data/ability-update-bases.json",root), serialized=JSON.stringify(manifest,null,2)+"\n";
if (process.argv.includes("--check")) {
  if (await readFile(output,"utf8") !== serialized) throw new Error("Ability correction baselines differ from immutable v2.7.1.");
} else await writeFile(output,serialized);
console.info(`Verified ${ids.length} immutable ability correction baselines.`);
