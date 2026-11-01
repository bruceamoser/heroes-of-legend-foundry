import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  acquireAbility,
  craftingPermissions,
  inventoryTotals,
  instrumentOwnershipErrors,
} from "../src/rules/acquisition.mjs";
const catalog = JSON.parse(
  await readFile(
    new URL("../static/data/inventory.json", import.meta.url),
    "utf8",
  ),
);
const choices = JSON.parse(
  await readFile(
    new URL("../static/data/choices.json", import.meta.url),
    "utf8",
  ),
);
const acquire = (state, id, selection = {}) =>
  acquireAbility(state, "ability-" + id, selection, catalog);
test("every pinned ability has one source-matched acquisition adapter and references resolve", () => {
  const abilities = choices.records.filter((r) => r.kind === "ability");
  assert.equal(catalog.acquisitions.length, abilities.length);
  assert.equal(new Set(catalog.acquisitions.map((a) => a.id)).size, abilities.length);
  for (const a of abilities) {
    const adapter = catalog.acquisitions.find((r) => r.id === a.id);
    assert.equal(adapter.source.sha256, a.source.sha256);
    for (const id of adapter.items)
      assert(catalog.equipment.some((r) => r.id === id));
    for (const id of adapter.recipes)
      assert(catalog.recipes.some((r) => r.id === id));
  }
  for (const r of catalog.recipes)
    for (const id of r.permissions) assert(abilities.some((a) => a.id === id));
});
test("shared weapons grant once, and sold gear is not restored by replay", () => {
  const first = acquire({}, "break-the-charge", { meleeHands: 2 });
  assert(first.valid);
  const second = acquire(first.state, "hook-and-drive");
  assert(second.valid);
  assert.equal(second.state.items.length, 1);
  assert.equal(second.state.items[0].hands, 2);
  assert.equal(
    second.state.acquisitionReceipts[1].grants[0].disposition,
    "already-owned",
  );
  const sold = structuredClone(second.state);
  sold.items = [];
  assert.equal(acquire(sold, "break-the-charge").state.items.length, 0);
  assert.deepEqual(first.state.items.length, 1);
});
test("ranged grants check weapon and ammo independently; revised equipment requirements grant only printed gear", () => {
  const state = {
    items: [
      {
        instanceId: "bow",
        catalogId: "item-ordinary-ranged-weapon",
        quantity: 1,
      },
    ],
  };
  const r = acquire(state, "pinning-shot");
  assert(r.valid);
  assert.equal(r.state.items.length, 2);
  assert.equal(r.state.items[1].inventoryDie, 8);
  // Mark the Quarry now requires ranged equipment; learning grants none.
  assert.equal(acquire({}, "signature-warden-turn-the-hunt").valid, true);
  assert.deepEqual(acquire({}, "signature-warden-turn-the-hunt").state.items, []);
  assert.equal(
    acquire({}, "anatomy-of-an-opening", { meleeHands: 1 }).state.items
      .length,
    1,
  );
  assert(
    !acquire({}, "anatomy-of-an-opening", { weapon: "melee", meleeHands: 3 })
      .valid,
  );
  assert.throws(() => acquire({}, "unknown"), /Unreviewed/);
});
test("recipe grants include prose grants but never create ingredients or finished products", () => {
  const r = acquire({}, "smoke-in-a-bottle");
  assert(r.valid);
  assert.deepEqual(r.state.recipes, [
    "recipe-smoke-flask",
    "recipe-travel-food",
  ]);
  assert.deepEqual(
    r.state.items.map((i) => i.catalogId),
    ["item-mixing-kit"],
  );
  assert.deepEqual(
    craftingPermissions(
      ["ability-smoke-in-a-bottle"],
      catalog,
    ).compatibleRecipes.sort(),
    ["recipe-smoke-flask", "recipe-travel-food"],
  );
  assert.equal(craftingPermissions([], catalog).capabilities.length, 0);
  const invalid = acquire({}, "trail-workshop", {
    recipes: ["recipe-smoke-flask", "recipe-travel-food"],
  });
  assert(!invalid.valid);
  assert.deepEqual(invalid.state, {});
  const valid = acquire({}, "trail-workshop", {
    recipes: ["recipe-bound-torches", "recipe-travel-food"],
  });
  assert(valid.valid);
  assert.equal(valid.state.items.length, 1);
  assert.equal(valid.state.recipes.length, 2);
});
test("market metadata and Bulk keep containers, supplies and spare clothing visible", () => {
  assert.equal(catalog.equipment.filter(record => !record.grantOnly).length, 44);
  assert.equal(catalog.recipes.length, 10);
  assert.equal(
    catalog.equipment.find((r) => r.id === "item-ordinary-heavy-armor").price,
    90,
  );
  assert(
    catalog.equipment.find((r) => r.id === "item-ember-edge").specialOrder,
  );
  const items = [
    { instanceId: "clothes", catalogId: "item-travel-clothes", quantity: 2 },
    { instanceId: "pack", catalogId: "item-travel-pack", quantity: 1 },
    { instanceId: "ammo", catalogId: "item-ammunition-bundle", quantity: 1 },
  ];
  assert.equal(
    inventoryTotals(items, catalog, { wornOutfitId: "clothes" }).bulk,
    3,
  );
  assert.equal(inventoryTotals(items, catalog).bulk, 4);
  assert.throws(
    () => inventoryTotals([{ ...items[0], quantity: -1 }], catalog),
    /quantity/,
  );
});

test("choice-once languages use campaign definitions and reject known or uncommon choices", () => {
  const language = {
    id: "river",
    name: "River Sign",
    ordinary: true,
    form: "signed",
    writing: false,
  };
  const inventory = {
    ...catalog,
    acquisitions: [
      {
        id: "ability-another-tongue",
        items: [],
        recipes: [],
        languageChoice: true,
        source: { sha256: "source" },
      },
    ],
  };
  const state = {
    abilities: ["ability-another-tongue"],
    languages: [{ id: "common" }],
  };
  const result = acquireAbility(
    state,
    "ability-another-tongue",
    { languageId: "river" },
    inventory,
    { languages: [language] },
  );
  assert.equal(result.valid, true);
  assert.equal(result.state.languages[1].permissions.sign, true);
  assert.equal(result.state.languages[1].permissions.read, false);
  assert.equal(result.state.languages[1].source, "ability-another-tongue");
  assert.equal(state.languages.length, 1);
  assert.equal(
    acquireAbility(result.state, "ability-another-tongue", {}, inventory)
      .replayed,
    true,
  );
  for (const definition of [
    { ...language, ordinary: false },
    { ...language, id: "common" },
  ])
    assert.equal(
      acquireAbility(
        state,
        "ability-another-tongue",
        { languageId: definition.id },
        inventory,
        { languages: [definition] },
      ).valid,
      false,
    );
});

test("chosen instrument is required, bounded and retained in its acquisition receipt", () => {
  const inventory = {
    ...catalog,
    acquisitions: [
      {
        id: "ability-a-party-piece",
        items: [],
        recipes: [],
        instrumentChoice: true,
        source: { sha256: "source" },
      },
    ],
  };
  for (const instrument of ["", " ", "a".repeat(121)])
    assert.equal(
      acquireAbility({}, "ability-a-party-piece", { instrument }, inventory)
        .valid,
      false,
    );
  const result = acquireAbility(
    {},
    "ability-a-party-piece",
    { instrument: "  lute  " },
    inventory,
  );
  assert.deepEqual(result.state.instruments, [
    { abilityId: "ability-a-party-piece", instrument: "lute" },
  ]);
  assert.equal(
    result.state.acquisitionReceipts[0].selection.instrument,
    "  lute  ",
  );
});

test("Party Piece requires owned ordinary instrument and grants none; legacy specialties do not qualify", () => {
  const inventory = {...catalog, acquisitions: [{id: "ability-a-party-piece", items: [], recipes: [], instrumentChoice: true, source: {sha256: "source"}}]};
  const legacy = acquireAbility({}, "ability-a-party-piece", {specialty: "singing"}, inventory);
  assert.equal(legacy.valid, false);
  const learned = acquireAbility({}, "ability-a-party-piece", {instrument: "flute"}, inventory);
  assert.equal(learned.valid, true);
  assert.deepEqual(learned.state.items, []);
  const state = {...learned.state, abilities: ["ability-a-party-piece"]};
  assert.equal(instrumentOwnershipErrors(state).length, 1);
  assert.equal(instrumentOwnershipErrors(state, [{catalogId: "item-craft-tools"}]).length, 1);
  assert.deepEqual(instrumentOwnershipErrors(state, [{catalogId: "item-musical-instrument"}]), []);
  assert.equal(instrumentOwnershipErrors(state, [{catalogId: "item-musical-instrument", quantity: 0}]).length, 1);
});

test("High Guard supplies one ordinary shield only when needed, without replacing owned equipment", () => {
  const adapter = catalog.acquisitions.find(a => a.id === "ability-high-guard");
  assert.deepEqual(adapter.items, ["item-ordinary-shield"]);
  const result = acquireAbility({}, adapter.id, {}, catalog);
  assert.equal(result.valid, true);
  assert.equal(result.state.items.length, 1);
  assert.equal(result.state.items[0].catalogId, "item-ordinary-shield");
  const owned = {instanceId: "my-shield", catalogId: "item-ordinary-shield", quantity: 1};
  const retained = acquireAbility({items: [owned]}, adapter.id, {}, catalog);
  assert.deepEqual(retained.state.items, [owned]);
  assert.equal(retained.state.acquisitionReceipts[0].grants[0].disposition, "already-owned");
});

test("approved device gear is supplied once with no invented market price", () => {
  for (const [ability, id] of [["a-marvel-on-wheels","item-folding-launcher"],["spring-in-the-sleeve","item-spring-hook-bracer"]]) {
    const first=acquire({},ability);
    assert.equal(first.valid,true);
    assert.equal(first.state.items[0].catalogId,id);
    assert.equal(acquire(first.state,ability).state.items.length,1);
    const owned=acquire({items:[{catalogId:id,instanceId:"owned"}]},ability);
    assert.equal(owned.state.items.length,1);
    const record=catalog.equipment.find(r=>r.id===id);
    assert.equal(record.bulk,1);
    assert.equal(record.grantOnly,true);
    assert.equal(record.price,undefined);
  }
});
