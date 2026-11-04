import { abilityItemSource } from "../rules/item-construction.mjs";
import { abilityRuleFingerprint, planAbilityRuleUpdate } from "../rules/ability-rule-update.mjs";
import { loadCatalogs } from "./catalog.mjs";
import { updateOwnedDocument } from "./documents.mjs";
const ID = "heroes-of-legend";
let bases;
async function loadBases() {
  bases ??= fetch(`systems/${ID}/data/ability-update-bases.json`).then(response => {
    if (!response.ok) throw new Error("Ability update baselines are unavailable.");
    return response.json();
  }).catch(error => { bases = null; throw error; });
  return bases;
}
function assertOwner(item) {
  if (item?.type !== "ability" || !item.id || item.pack || !item.testUserPermission(game.user,"OWNER"))
    throw new Error("You must own a saved world ability to update its rules.");
}
export async function abilityRuleUpdateAvailable(item) {
  if (item?.type !== "ability" || !item.id || item.pack || !item.testUserPermission(game.user,"OWNER")) return false;
  return Boolean((await loadBases()).abilities?.[item.getFlag(ID,"catalogId")]);
}
/** Preview is read-only. No document changes occur until the owner confirms it. */
export async function previewAbilityRuleUpdate(item) {
  assertOwner(item);
  const catalogs = await loadCatalogs(), manifest = await loadBases();
  const identity = item.getFlag(ID,"catalogId");
  const record = catalogs.choices.find(record => record.kind === "ability" && record.id === identity);
  const baseline = manifest.abilities?.[identity];
  if (!record || !baseline) throw new Error("This ability has no verified correction baseline.");
  const source = item.toObject();
  const current = abilityItemSource(record,{sourceCommit:catalogs.commit});
  const plan = await planAbilityRuleUpdate({item:source,current,baseline});
  assertOwner(item);
  return {...plan, itemUuid:item.uuid, snapshot:await abilityRuleFingerprint(source), sourceCommit:catalogs.commit};
}
export async function applyAbilityRuleUpdate(item, preview) {
  assertOwner(item);
  if (!preview || preview.itemUuid !== item.uuid || preview.catalogId !== item.getFlag(ID,"catalogId"))
    throw new Error("Ability identity changed. Review its rules update again.");
  const current = await previewAbilityRuleUpdate(item);
  if (current.snapshot !== preview.snapshot || current.sourceCommit !== preview.sourceCommit || JSON.stringify(current.changes) !== JSON.stringify(preview.changes))
    throw new Error("The ability changed while its update was open. Review it again.");
  assertOwner(item);
  if (await abilityRuleFingerprint(item.toObject()) !== preview.snapshot)
    throw new Error("The ability changed while its update was open. Review it again.");
  if (Object.keys(current.changes).length) await updateOwnedDocument(item,current.changes);
  return {updated:current.updated,preserved:current.preserved};
}
