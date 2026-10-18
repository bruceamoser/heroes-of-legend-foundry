import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  PASSIVE_DEFENSE_DEFINITIONS,
  passiveDefenseSources,
} from "../src/rules/passive-defenses.mjs";
import { damageEvent } from "../src/rules/damage.mjs";
import {
  conditionTickRequirements,
  conditionTurn,
} from "../src/rules/condition-turn.mjs";
import { damageBasis, damagePreview } from "../src/services/damage.mjs";
import { recoveryPreview } from "../src/services/recovery.mjs";
import { conditionFinishAction } from "../src/dialogs/turn-end.mjs";

const choices = JSON.parse(
  await readFile(new URL("../static/data/choices.json", import.meta.url)),
);
const inventory = JSON.parse(
  await readFile(new URL("../static/data/inventory.json", import.meta.url)),
);
const recordSource = (catalogId) =>
  choices.records.find((record) => record.id === catalogId)?.source ??
  inventory.equipment.find((record) => record.id === catalogId)?.source;
const ability = (catalogId, instanceId = `ability-${catalogId}`) => ({
  instanceId,
  catalogId,
  source: recordSource(catalogId),
});
const equipment = (
  catalogId,
  instanceId = `item-${catalogId}`,
  worn = true,
) => ({
  instanceId,
  catalogId,
  source: recordSource(catalogId),
  worn,
});
const source = (type, value) => ({
  type,
  value,
  label: `${type} fixture`,
  automatic: false,
});
const condition = (id, key, rating) => ({
  id,
  key,
  rating,
  persistence: "temporary",
  source: id,
});

test("reviewed passive records match the pinned catalog paths and hashes", () => {
  for (const [catalogId, definition] of Object.entries(
    PASSIVE_DEFENSE_DEFINITIONS,
  )) {
    const catalogSource = recordSource(catalogId);
    assert.equal(definition.source.path, catalogSource.path);
    assert.equal(definition.source.sha256, catalogSource.sha256);
  }
});

test("light, medium and heavy armor require both learned training and the matching worn armor", () => {
  for (const [abilityId, itemId, value] of [
    ["ability-wear-light-armor", "item-ordinary-light-armor", 1],
    ["ability-wear-medium-armor", "item-ordinary-medium-armor", 2],
    ["ability-wear-heavy-armor", "item-ordinary-heavy-armor", 3],
  ]) {
    assert.equal(
      passiveDefenseSources({ abilities: [ability(abilityId)], equipment: [] })
        .resistances.length,
      0,
    );
    assert.equal(
      passiveDefenseSources({
        abilities: [],
        equipment: [equipment(itemId)],
      }).resistances.length,
      0,
    );
    assert.equal(
      passiveDefenseSources({
        abilities: [ability(abilityId)],
        equipment: [equipment(itemId, `carried-${itemId}`, false)],
      }).resistances.length,
      0,
    );
    const result = passiveDefenseSources({
      abilities: [ability(abilityId)],
      equipment: [equipment(itemId)],
    });
    assert.equal(result.resistances.length, 1);
    assert.equal(result.resistances[0].type, "physical");
    assert.equal(result.resistances[0].value, value);
    assert.equal(result.resistances[0].automatic, true);
    assert.equal(result.resistances[0].provenance.length, 2);
  }
  assert.equal(
    passiveDefenseSources({
      abilities: [ability("ability-wear-medium-armor")],
      equipment: [equipment("item-ordinary-heavy-armor")],
    }).resistances.length,
    0,
  );
});

test("reviewed legacy armor snapshots keep their resistance without changing owned records", () => {
  for (const tier of ["medium", "heavy"]) {
    const abilityId = `ability-wear-${tier}-armor`,
      itemId = `item-ordinary-${tier}-armor`;
    const abilities = [
      {
        ...ability(abilityId),
        source: PASSIVE_DEFENSE_DEFINITIONS[abilityId].legacySources[0],
      },
    ];
    const items = [
      {
        ...equipment(itemId),
        source: PASSIVE_DEFENSE_DEFINITIONS[itemId].legacySources[0],
      },
    ];
    const before = JSON.stringify({ abilities, items });
    const result = passiveDefenseSources({ abilities, equipment: items });
    assert.equal(result.resistances.length, 1);
    assert.equal(result.resistances[0].value, tier === "medium" ? 2 : 3);
    assert.equal(
      result.resistances[0].provenance[0].commit,
      "9bc9b4fe3256e68880b92c45facf0f25b98a1ea3",
    );
    assert.equal(JSON.stringify({ abilities, items }), before);
    assert.throws(
      () =>
        passiveDefenseSources({
          abilities,
          equipment: [
            { ...items[0], source: { ...items[0].source, sha256: "bad" } },
          ],
        }),
      /source changed/,
    );
  }
  assert.equal(
    passiveDefenseSources({
      abilities: [ability("ability-wear-light-armor")],
      equipment: [equipment("item-ordinary-light-armor")],
    }).resistances[0].value,
    1,
  );
});

test("item-only passives require worn state and unknown narrative IDs stay inert", () => {
  for (const [catalogId, type] of [
    ["item-winter-lining", "cold"],
    ["item-gravebound-brooch", "life"],
  ]) {
    assert.equal(
      passiveDefenseSources({
        equipment: [equipment(catalogId, undefined, false)],
      }).resistances.length,
      0,
    );
    const worn = passiveDefenseSources({
      equipment: [equipment(catalogId)],
    });
    assert.deepEqual(
      worn.resistances.map(({ type, value, automatic }) => ({
        type,
        value,
        automatic,
      })),
      [{ type, value: 1, automatic: true }],
    );
  }
  const unknown = passiveDefenseSources({
    equipment: [
      {
        instanceId: "narrative-only",
        catalogId: "narrative-winter-lining",
        worn: true,
        name: "Winter Lining",
        description: "Grants Cold resistance 9 while worn.",
      },
    ],
  });
  assert.deepEqual(unknown.resistances, []);
  assert.equal(unknown.ignored[0].catalogId, "narrative-winter-lining");
});

test("provenance drift for either half of an armor source is rejected", () => {
  const learned = ability("ability-wear-medium-armor");
  assert.throws(
    () =>
      passiveDefenseSources({
        abilities: [
          { ...learned, source: { ...learned.source, sha256: "bad" } },
        ],
        equipment: [equipment("item-ordinary-medium-armor")],
      }),
    /source changed/,
  );
  const armor = equipment("item-ordinary-medium-armor");
  assert.throws(
    () =>
      passiveDefenseSources({
        abilities: [learned],
        equipment: [
          {
            ...armor,
            source: { ...armor.source, path: "design/equipment/old.md" },
          },
        ],
      }),
    /source changed/,
  );
});

test("automatic sources merge by highest value, cap at 3, and never create an absent type", () => {
  const automatic = passiveDefenseSources({
    abilities: [ability("ability-wear-heavy-armor")],
    equipment: [equipment("item-ordinary-heavy-armor")],
  });
  const result = damageEvent({
    components: [
      { type: "physical", amount: 5 },
      { type: "fire", amount: 2 },
    ],
    resistances: [...automatic.resistances, source("physical", 8)],
    weaknesses: [source("fire", 9)],
  });
  assert.equal(result.breakdown[0].resistance, 3);
  assert.equal(result.breakdown[0].afterResistance, 2);
  assert.equal(result.breakdown[1].weakness, 3);
  assert.equal(result.breakdown[1].resistance, 0);
  assert.equal(result.breakdown[1].afterResistance, 5);
  assert.deepEqual(
    damageEvent({
      components: [{ type: "physical", amount: 1 }],
      weaknesses: [source("fire", 3)],
    }).breakdown.map((entry) => entry.type),
    ["physical"],
  );
});

test("creature printed DR remains one Physical source and the red dragon stays at 3", () => {
  const passiveDefenses = passiveDefenseSources({
    abilities: [ability("ability-wear-heavy-armor")],
    equipment: [equipment("item-ordinary-heavy-armor")],
  });
  const plan = damagePreview(
    { type: "creature" },
    {
      hp: 12,
      maxHp: 12,
      printedArmor: 3,
      passiveDefenses,
    },
    {
      components: [{ type: "physical", amount: 7 }],
      reason: "Red dragon armor and resistance fixture",
    },
  );
  assert.equal(plan.event.total, 4);
  assert.equal(plan.event.breakdown[0].resistance, 3);
  assert.equal(
    plan.resistances.filter((entry) => entry.type === "physical").length,
    2,
  );
});

test("automatic Cold resistance applies to Freezing while Bleeding still bypasses", () => {
  const passiveDefenses = passiveDefenseSources({
    equipment: [equipment("item-winter-lining")],
  });
  assert.deepEqual(
    conditionTickRequirements(
      [condition("cold", "freezing", 3)],
      passiveDefenses,
    ),
    { keys: ["freezing"], orderRequired: false, typesNeedingReview: [] },
  );
  assert.equal(
    conditionTurn({
      turnId: "freeze",
      hp: 12,
      maxHp: 12,
      character: false,
      contributions: [condition("cold", "freezing", 3)],
      passiveDefenses,
    }).hp,
    10,
  );
  assert.equal(
    conditionTurn({
      turnId: "bleed",
      hp: 12,
      maxHp: 12,
      character: false,
      contributions: [condition("blood", "bleeding", 3)],
      passiveDefenses,
    }).hp,
    9,
  );
});

test("manual condition values are additional sources rather than a passive cache", () => {
  const passiveDefenses = passiveDefenseSources({
    equipment: [equipment("item-winter-lining")],
  });
  const result = conditionTurn({
    turnId: "manual",
    hp: 12,
    maxHp: 12,
    character: false,
    contributions: [condition("cold", "freezing", 3)],
    passiveDefenses,
    policy: {
      resistances: [source("cold", 2)],
      weaknesses: [],
    },
  });
  assert.equal(result.hp, 11);
  assert.equal(
    conditionTurn({
      turnId: "automatic",
      hp: 12,
      maxHp: 12,
      character: false,
      contributions: [condition("cold", "freezing", 3)],
      passiveDefenses,
      policy: { resistances: [source("cold", 1)] },
    }).hp,
    10,
  );
});

test("saved reviewed manual condition policy finishes without reopening the dialog", () => {
  const policy = {
    reviewed: true,
    reason: "The fire ward covers this encounter.",
    order: ["burning"],
    durationPolicies: {},
    resistances: [{ type: "fire", value: 2 }],
    weaknesses: [],
  };
  assert.equal(
    conditionFinishAction({
      policy,
      requirements: {
        keys: ["burning"],
        orderRequired: false,
        typesNeedingReview: ["fire"],
      },
    }),
    "use-saved-policy",
  );
});

test("additional mitigation is optional while explicit review opens the dialog", () => {
  assert.equal(
    conditionFinishAction({
      requirements: {
        keys: ["freezing"],
        orderRequired: false,
        typesNeedingReview: ["cold"],
      },
    }),
    "finish",
  );
  assert.equal(
    conditionFinishAction({
      review: true,
      policy: {
        reviewed: true,
        order: ["freezing"],
        durationPolicies: {},
      },
      requirements: {
        keys: ["freezing"],
        orderRequired: false,
        typesNeedingReview: [],
      },
    }),
    "review",
  );
});

test("automatic-only Cold finishes directly while missing order or duration rulings prompt", () => {
  assert.equal(
    conditionFinishAction({
      requirements: {
        keys: ["freezing"],
        orderRequired: false,
        typesNeedingReview: [],
      },
    }),
    "finish",
  );
  assert.equal(
    conditionFinishAction({
      policy: {
        reviewed: true,
        order: ["burning"],
        durationPolicies: { blinded: "combined" },
      },
      requirements: {
        keys: ["burning", "freezing"],
        orderRequired: true,
        typesNeedingReview: [],
      },
    }),
    "review",
  );
  assert.equal(
    conditionFinishAction({
      policy: {
        reviewed: true,
        order: ["freezing"],
        durationPolicies: { blinded: "combined" },
      },
      requirements: {
        keys: ["freezing"],
        orderRequired: false,
        typesNeedingReview: [],
      },
      durationKeys: ["blinded", "deafened"],
    }),
    "review",
  );
});

test("Gravebound Brooch contributes to Life damage and healing without summing with manual sources", () => {
  const passiveDefenses = passiveDefenseSources({
    equipment: [equipment("item-gravebound-brooch")],
  });
  assert.equal(
    damageEvent({
      components: [{ type: "life", amount: 3 }],
      resistances: passiveDefenses.resistances,
    }).total,
    2,
  );
  const actor = { type: "creature" };
  assert.equal(
    recoveryPreview(
      actor,
      {
        hp: 9,
        maxHp: 12,
        passiveDefenses,
      },
      { kind: "heal", amount: 3, lifeResistance: 0 },
    ).after,
    11,
  );
  assert.equal(
    recoveryPreview(
      actor,
      { hp: 9, maxHp: 12, passiveDefenses },
      { kind: "heal", amount: 3, lifeResistance: 3 },
    ).after,
    10,
  );
  assert.equal(
    recoveryPreview(
      actor,
      { hp: 9, maxHp: 12, passiveDefenses },
      { kind: "heal", amount: 1, lifeResistance: 0 },
    ).after,
    10,
  );
});

test("a native custom ability without catalog flags does not disable damage or recovery", () => {
  const customAbility = {
    id: "native-custom-ability",
    type: "ability",
    getFlag: () => null,
  };
  const actor = {
    type: "character",
    uuid: "Actor.custom-ability",
    pack: null,
    items: [customAbility],
    system: {
      health: { value: 9, max: 12 },
      grit: { available: 0 },
    },
    getFlag: () => null,
  };
  const basis = damageBasis(actor);
  assert.deepEqual(basis.passiveDefenses, {
    resistances: [],
    weaknesses: [],
  });
  assert.equal(
    damagePreview(actor, basis, {
      components: [{ type: "physical", amount: 2 }],
      reason: "Native custom ability damage fixture",
    }).after,
    7,
  );
  assert.equal(
    recoveryPreview(actor, basis, {
      kind: "heal",
      amount: 2,
      lifeResistance: 0,
    }).after,
    11,
  );
});

test("damage basis snapshots passive provenance as mutable serializable JSON", () => {
  const abilityId = "ability-wear-medium-armor",
    armorId = "item-ordinary-medium-armor",
    abilitySource = recordSource(abilityId),
    armorSource = recordSource(armorId);
  const actor = {
    type: "character",
    uuid: "Actor.passive-json",
    pack: null,
    items: [
      {
        id: "ability-instance",
        type: "ability",
        getFlag: (scope, key) => {
          if (key === "catalogId") return abilityId;
          if (key === "source") return abilitySource;
          return null;
        },
      },
      {
        id: "armor-instance",
        type: "equipment",
        system: {
          catalogId: armorId,
          worn: true,
        },
        getFlag: (scope, key) => (key === "source" ? armorSource : null),
      },
    ],
    system: {
      health: { value: 8, max: 12 },
      grit: { available: 0 },
    },
    getFlag: () => null,
  };
  const basis = damageBasis(actor),
    snapshot = basis.passiveDefenses.resistances[0];
  assert.deepEqual(snapshot, {
    sourceId: "passive-wear-medium-armor:armor-instance",
    type: "physical",
    value: 2,
    label: "Wear Medium Armor with ordinary medium armor",
    automatic: true,
    provenance: [
      {
        kind: "ability",
        catalogId: abilityId,
        ...PASSIVE_DEFENSE_DEFINITIONS[abilityId].source,
      },
      {
        kind: "equipment",
        catalogId: armorId,
        ...PASSIVE_DEFENSE_DEFINITIONS[armorId].source,
      },
    ],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(basis)), basis);
  assert.equal(Object.isFrozen(snapshot), false);
  assert.equal(Object.isFrozen(snapshot.provenance), false);
  assert.ok(snapshot.provenance.every((record) => !Object.isFrozen(record)));

  snapshot.provenance[0].path = "snapshot-only.md";
  snapshot.provenance.push({ kind: "snapshot-only" });
  assert.equal(recordSource(abilityId).path, abilitySource.path);
  assert.equal(
    PASSIVE_DEFENSE_DEFINITIONS[abilityId].source.path,
    abilitySource.path,
  );
});

test("a stale worn snapshot changes the damage basis even when equipment revision is unchanged", () => {
  const winter = {
    id: "winter-instance",
    type: "equipment",
    system: {
      catalogId: "item-winter-lining",
      worn: true,
      hands: 0,
      held: false,
      quantity: 1,
    },
    getFlag: (scope, key) =>
      key === "source" ? recordSource("item-winter-lining") : null,
  };
  const actor = {
    type: "character",
    uuid: "Actor.passive",
    pack: null,
    items: [winter],
    system: {
      health: { value: 8, max: 12 },
      grit: { available: 0 },
    },
    getFlag: (scope, key) =>
      ({
        survival: null,
        damageRevision: 2,
        equipmentRevision: 7,
      })[key],
  };
  const before = damageBasis(actor);
  assert.equal(before.equipmentRevision, 7);
  assert.equal(before.passiveDefenses.resistances[0].type, "cold");
  winter.system.worn = false;
  const after = damageBasis(actor);
  assert.equal(after.equipmentRevision, 7);
  assert.deepEqual(after.passiveDefenses.resistances, []);
  assert.notDeepEqual(before, after);
});
