import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  profileFingerprint,
  profilePaths,
  profileValue,
  planProfileUpdate,
} from "../src/rules/profile-update.mjs";
import {
  profileUpdateAvailable,
  updateCreatureProfile,
} from "../src/services/profile-update.mjs";

const ID = "heroes-of-legend";
const bases = JSON.parse(
  await readFile(
    new URL("../static/data/profile-update-bases.json", import.meta.url),
  ),
);
const oldSha = "d67e046466bdd5052360b96ed91861d607091446";

async function fixture(type, name = "adder") {
  const path = `../content/packs/${type}s/${type}-${name}.json`;
  const current = JSON.parse(await readFile(new URL(path, import.meta.url)));
  const live = structuredClone(current);
  const id = `${type}-${name}`;
  const base = bases.profiles[id];
  live.flags[ID].source.sha256 = base.sourceSha;
  live.flags[ID].sourceCommit = oldSha;
  return { current, live, base };
}

test("baseline fingerprints cover all 265 old printed profiles and ignore link commit pins", () => {
  assert.equal(Object.keys(bases.profiles).length, 265);
  assert.equal(
    profileFingerprint(
      " https://github.com/bruceamoser/heroes-of-legend/blob/" + oldSha + "/a ",
    ),
    profileFingerprint(
      "https://github.com/bruceamoser/heroes-of-legend/blob/" +
        "b".repeat(40) +
        "/a",
    ),
  );
});

test("creature update changes only old printed blocks, preserving custom actions and combat state", async () => {
  const { current, live, base } = await fixture("creature");
  live.system.cv = 3;
  live.system.actions.entries.push({ id: "local", name: "Homebrew" });
  live.system.details.flavorMarkdown = "Our forest snake";
  live.system.health.value = 0;
  live.system.health.baseMax = 99;
  live.system.attributes.brawn.base = 8;
  live.system.speed = 8;
  live.system.armor = 4;
  live.effects = [{ _id: "effect" }];
  live.items = [{ _id: "item" }];
  live.flags[ID].localNote = "keep";
  const plan = planProfileUpdate({ actor: live, current, baseline: base });
  assert.deepEqual(plan.preserved.sort(), [
    "system.actions",
    "system.cv",
    "system.details.flavorMarkdown",
  ]);
  assert(
    !Object.keys(plan.changes).some((key) =>
      /health|attributes|speed|armor|effects|items|flags/.test(key),
    ),
  );
  assert.equal(plan.current, false);
});

test("unknown baseline preserves divergent blocks and exact current imports need no changes", async () => {
  const { current, live } = await fixture("creature");
  live.system.actions.entries.push({ id: "local", name: "Homebrew" });
  const unknown = planProfileUpdate({ actor: live, current, baseline: null });
  assert(unknown.preserved.includes("system.actions"));
  assert(!("system.actions" in unknown.changes));
  const fresh = planProfileUpdate({ actor: current, current, baseline: null });
  assert.deepEqual(fresh.updated, []);
  assert.deepEqual(fresh.preserved, []);
  assert.equal(fresh.current, true);
});

test("an actual previous CV advances to its reviewed value without touching a custom action", async () => {
  const { current, live, base } = await fixture("creature", "air-elemental");
  assert.equal(current.system.cv, 22);
  assert.equal(base.fields["system.cv"], profileFingerprint(21));
  live.system.cv = 21;
  live.system.actions.entries.push({ id: "local", name: "Custom" });
  const first = planProfileUpdate({ actor: live, current, baseline: base });
  assert.equal(first.changes["system.cv"], 22);
  assert(first.updated.includes("system.cv"));
  assert(first.preserved.includes("system.actions"));
  live.system.cv = first.changes["system.cv"];
  const repeat = planProfileUpdate({ actor: live, current, baseline: base });
  assert(!("system.cv" in repeat.changes));
  assert(repeat.preserved.includes("system.actions"));
});

test("previous skeleton horse actions become the reviewed Reaction profile and replay is inert", async () => {
  const { current, live, base } = await fixture("creature", "skeleton-horse");
  const oldActions = JSON.parse(
    await readFile(
      new URL(
        "./fixtures/profile-update-skeleton-horse-old-actions.json",
        import.meta.url,
      ),
    ),
  );
  assert.equal(profileFingerprint(oldActions), base.fields["system.actions"]);
  const hydratedOldActions = structuredClone(oldActions);
  for (const entry of hydratedOldActions.entries) entry.abilityId = "";
  assert.equal(
    profileFingerprint(hydratedOldActions),
    base.fields["system.actions"],
  );
  assert(!oldActions.entries.some((entry) => entry.name === "Fall to Pieces"));
  assert(
    current.system.actions.entries.some(
      (entry) => entry.name === "Fall to Pieces",
    ),
  );
  live.system.actions = hydratedOldActions;
  live.system.cv = 15;
  const first = planProfileUpdate({ actor: live, current, baseline: base });
  assert.equal(first.current, true);
  assert(first.updated.includes("system.actions"));
  assert(first.updated.includes("system.cv"));
  for (const [path, value] of Object.entries(first.changes)) {
    const keys = path.split(".");
    const last = keys.pop();
    keys.reduce((object, key) => object[key], live)[last] =
      structuredClone(value);
  }
  const repeat = planProfileUpdate({ actor: live, current, baseline: base });
  assert.deepEqual(repeat.updated, []);
  assert.deepEqual(repeat.preserved, []);
});

test("GM world Actor path is idempotent and advances provenance only after complete profile", async () => {
  const { current, live } = await fixture("creature");
  const calls = [];
  const actor = {
    id: "world-actor",
    type: "creature",
    pack: null,
    parent: null,
    getFlag(namespace, key) {
      return live.flags[namespace]?.[key];
    },
    toObject() {
      return structuredClone(live);
    },
    testUserPermission() {
      return true;
    },
    async update(changes) {
      calls.push(changes);
      for (const [path, value] of Object.entries(changes)) {
        const keys = path.split(".");
        const last = keys.pop();
        const target = keys.reduce((object, key) => (object[key] ??= {}), live);
        if (last.startsWith("-=")) delete target[last.slice(2)];
        else target[last] = structuredClone(value);
      }
    },
  };
  const pack = {
    documentName: "Actor",
    async getIndex() {
      return [
        { _id: "pack-actor", flags: { [ID]: { catalogId: "creature-adder" } } },
      ];
    },
    async getDocument(id) {
      assert.equal(id, "pack-actor");
      return { toObject: () => current };
    },
  };
  const previousGame = globalThis.game;
  const previousFetch = globalThis.fetch;
  globalThis.game = {
    user: { isGM: true },
    actors: { get: () => actor },
    packs: { get: () => pack },
  };
  globalThis.fetch = async () => ({ ok: true, json: async () => bases });
  try {
    assert(profileUpdateAvailable(actor));
    const first = await updateCreatureProfile(actor);
    assert.equal(first.current, true);
    assert.equal(live.flags[ID].sourceCommit, current.flags[ID].sourceCommit);
    if (current.flags[ID].monsterAbilityTemplates) {
      assert.deepEqual(
        live.flags[ID].monsterAbilityTemplates,
        current.flags[ID].monsterAbilityTemplates,
      );
    }
    const count = calls.length;
    const second = await updateCreatureProfile(actor);
    assert.deepEqual(second, { updated: [], preserved: [], current: true });
    assert.equal(calls.length, count);
    live.system.actions.entries.push({ id: "local", name: "Custom" });
    live.flags[ID].sourceCommit = oldSha;
    live.flags[ID].source.sha256 = bases.profiles["creature-adder"].sourceSha;
    const partial = await updateCreatureProfile(actor);
    assert.equal(partial.current, false);
    assert.equal(live.flags[ID].sourceCommit, oldSha);
    assert.equal(live.flags[ID].profileUpdate.partial, true);
    const partialCount = calls.length;
    await updateCreatureProfile(actor);
    assert.equal(calls.length, partialCount);
    globalThis.game.user.isGM = false;
    assert.equal(profileUpdateAvailable(actor), false);
    await assert.rejects(updateCreatureProfile(actor), /GM/);
  } finally {
    globalThis.game = previousGame;
    globalThis.fetch = previousFetch;
  }
});

test("a safe CV refresh aligns classification without replacing local classification metadata", async () => {
  const { current, live } = await fixture("creature", "air-elemental");
  live.system.cv = 21;
  live.flags[ID].classification.cv = 21;
  live.flags[ID].classification.note = "local context";
  live.system.actions.entries.push({ id: "local", name: "Custom" });
  const calls = [];
  const actor = {
    id: "world-elemental",
    type: "creature",
    pack: null,
    parent: null,
    getFlag(namespace, key) {
      return live.flags[namespace]?.[key];
    },
    toObject() {
      return structuredClone(live);
    },
    testUserPermission() {
      return true;
    },
    async update(changes) {
      calls.push(changes);
    },
  };
  const previousGame = globalThis.game;
  const previousFetch = globalThis.fetch;
  globalThis.game = {
    user: { isGM: true },
    actors: { get: () => actor },
    packs: {
      get: () => ({
        documentName: "Actor",
        async getIndex() {
          return [
            {
              _id: "source",
              flags: { [ID]: { catalogId: "creature-air-elemental" } },
            },
          ];
        },
        async getDocument() {
          return { toObject: () => current };
        },
      }),
    },
  };
  globalThis.fetch = async () => ({ ok: true, json: async () => bases });
  try {
    const result = await updateCreatureProfile(actor);
    assert.equal(result.current, false);
    assert.equal(calls[0]["system.cv"], 22);
    assert.equal(calls[0][`flags.${ID}.classification.cv`], 22);
    assert(!(`flags.${ID}.classification` in calls[0]));
    assert(!(`flags.${ID}.sourceCommit` in calls[0]));
    assert(!(`flags.${ID}.monsterAbilityTemplates` in calls[0]));
  } finally {
    globalThis.game = previousGame;
    globalThis.fetch = previousFetch;
  }
});
