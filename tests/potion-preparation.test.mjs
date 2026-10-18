import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import { selectPotionRecipient } from "../src/rules/potion-targets.mjs";

test("native target hooks refresh potion UI, clear old consent and reject stale previews", async () => {
  const actors = new Map([
    ["Actor.giver", { testUserPermission: () => true }],
    ["Actor.other", { testUserPermission: () => false }],
  ]);
  const giver = { id: "giver", name: "Giver", actor: { uuid: "Actor.giver" }, token: { uuid: "Token.giver" } };
  const other = { id: "other", name: "Other", actor: { uuid: "Actor.other" }, token: { uuid: "Token.other" } };
  const participants = [giver, other];
  participants.get = (id) => participants.find((entry) => entry.id === id);
  const fields = new Map();
  for (const name of ["bottleUuid", "interruption", "willing", "geometryOverride", "daWillingness", "geometryReason", "daWillingnessReason"])
    fields.set(`[name=${name}]`, { value: name === "interruption" ? "continue" : "", type: ["willing", "geometryOverride", "daWillingness"].includes(name) ? "checkbox" : "text", checked: false });
  fields.set("[data-action=submit]", { disabled: true });
  const panelParts = new Map([["[data-willing-confirm]", {}], ["[data-willing-prompt]", {}]]);
  fields.set("[data-panel=willingness]", { querySelector: (selector) => panelParts.get(selector) });
  const element = { querySelector(selector) {
    if (!fields.has(selector)) fields.set(selector, { textContent: "" });
    return fields.get(selector);
  } };
  let targetHook, removedHook, defer = null, submitted = null;
  const user = { id: "owner", isGM: false, targets: new Set() };
  const services = {
    isHealingPotionItem: () => true, isPotionAbility: () => true,
    potionCombatContext: () => {},
    requestPotionUse: async (request) => { submitted = request; return { status: "request" }; },
    previewPotionAdjacency: async () => ({ known: true, adjacent: true, distance: 1 }),
    previewPotionUse: async ({ recipientParticipantId }) => {
      if (defer) return defer;
      return {
        canDeclare: true, recipientParticipantId,
        recipientActorUuid: recipientParticipantId === "giver" ? "Actor.giver" : "Actor.other",
        recipientActorName: recipientParticipantId === "giver" ? "Giver" : "Other",
        relation: recipientParticipantId === "giver" ? "self" : "other",
        combatUuid: "Combat.test", expected: {},
      };
    },
  };
  class Base {
    constructor() { this.rendered = true; }
    async _onClose() { this.rendered = false; }
  }
  const context = createContext({
    ui: { notifications: { info() {}, error(message) { throw new Error(message); } } },
    game: { user }, fromUuid: async (uuid) => actors.get(uuid),
    foundry: { applications: { api: { ApplicationV2: Base, HandlebarsApplicationMixin: (base) => base } } },
    Hooks: {
      on(name, callback) { assert.equal(name, "targetToken"); targetHook = callback; return 17; },
      off(name, id) { removedHook = [name, id]; },
    },
  });
  const url = new URL("../src/applications/potions.mjs", import.meta.url);
  const module = new SourceTextModule(await readFile(url, "utf8"), { context });
  await module.link(async (specifier) => {
    const exports = specifier.includes("services/") ? services : { selectPotionRecipient };
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  const app = new module.namespace.PotionPreparation({ uuid: "Item.potion" });
  Object.assign(app, { combat: { combatants: participants }, combatUuid: "Combat.test", giverParticipantId: "giver", element });
  const tick = () => new Promise(setImmediate);
  await app.refreshPreview();
  assert.equal(app.currentPreview.relation, "self");
  assert.equal(fields.get("[data-action=submit]").disabled, false);
  fields.get("[name=willing]").checked = true;
  fields.get("[name=geometryReason]").value = "Old recipient ruling";
  user.targets.add({ document: { uuid: other.token.uuid, actor: other.actor } });
  targetHook(user);
  await tick();
  assert.equal(app.currentPreview.recipientParticipantId, other.id);
  assert.equal(fields.get("[name=willing]").checked, false);
  assert.equal(fields.get("[name=geometryReason]").value, "");
  assert.equal(panelParts.get("[data-willing-confirm]").hidden, true);
  let resolveOld;
  defer = new Promise((resolve) => { resolveOld = resolve; });
  targetHook(user);
  user.targets.add({ document: { uuid: "Token.second", actor: { uuid: "Actor.second" } } });
  targetHook(user);
  await tick();
  assert.equal(app.currentPreview.error, "Use one target.");
  resolveOld({ canDeclare: true, combatUuid: "Combat.test", recipientActorUuid: "Actor.other" });
  await tick();
  assert.equal(app.currentPreview.error, "Use one target.");
  assert.equal(fields.get("[data-action=submit]").disabled, true);
  defer = null;
  user.targets.clear();
  targetHook(user);
  await tick();
  assert.equal(app.currentPreview.relation, "self");
  user.isGM = true;
  user.targets.add({ document: { uuid: other.token.uuid, actor: other.actor } });
  targetHook(user);
  await tick();
  // Notes alone never imply a ruling or consent.
  fields.get("[name=daWillingnessReason]").value = "A note without a choice";
  await app.refreshPreview();
  assert.equal(fields.get("[data-action=submit]").disabled, true);
  fields.get("[name=daWillingnessReason]").value = "";
  fields.get("[name=daWillingness]").checked = true;
  fields.get("[name=geometryOverride]").checked = true;
  await app.refreshPreview();
  assert.equal(fields.get("[data-action=submit]").disabled, false);
  app.close = () => app._onClose({});
  await app.constructor.submit.call(app);
  assert.equal(submitted.daWillingness, true);
  assert.equal(submitted.daWillingnessReason, "");
  assert.equal(submitted.geometry.mode, "da-ruling");
  assert.equal(submitted.geometry.reason, "");
  assert.deepEqual(removedHook, ["targetToken", 17]);
});
