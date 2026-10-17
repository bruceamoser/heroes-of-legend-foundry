import test from "node:test";
import assert from "node:assert/strict";
import {
  ABILITY_DEFINITIONS,
  abilityDefinition,
} from "../src/rules/ability-definitions.mjs";
import {
  basicMeleeDamage,
  basicMeleeRequestMatches,
  nearestAccessibleLine,
  nativeBasicMeleeGeometry,
  pendingAbilityIsPlayerAttack,
  targetVisibleToRequester,
  targetEvasionSources,
  woundApplicabilityMatches,
} from "../src/rules/player-attacks.mjs";
import { isMeleeWeaponEquipment } from "../src/rules/equipment-identity.mjs";
import { prepareRoll } from "../src/services/roll-preparation.mjs";

test("Basic Melee adapter pins the reviewed card and fixed 2/3/5 mapping", () => {
  const definition = ABILITY_DEFINITIONS["ability-basic-melee"];
  assert.deepEqual(definition.source, {
    path: "design/cards/basic-melee.md",
    sha256:
      "9d6e0b6ca75363b94c6886fb3c53087f854098f024aac232395c61fdc438ae40",
  });
  assert.equal(definition.category, "main");
  assert.equal(definition.attribute, "brawn");
  assert.equal(definition.handler, "player-basic-melee-v1");
  assert.deepEqual(definition.damage, {
    type: "physical",
    weak: 2,
    standard: 3,
    strong: 5,
  });
  assert.deepEqual(definition.requirement.grants, []);
  assert.equal(basicMeleeDamage("weak"), 2);
  assert.equal(basicMeleeDamage("standard"), 3);
  assert.equal(basicMeleeDamage("strong"), 5);
  assert.throws(() => basicMeleeDamage("critical"), /rolled attack tier/);
  assert.equal(
    abilityDefinition("ability-basic-melee", definition.source),
    definition,
  );
  assert.equal(
    isMeleeWeaponEquipment({
      type: "equipment",
      system: { catalogId: "item-ordinary-melee-weapon" },
    }),
    true,
  );
  assert.equal(
    isMeleeWeaponEquipment({
      type: "equipment",
      name: "Ordinary Melee Weapon",
      system: { catalogId: "fixture-not-a-sword" },
    }),
    false,
  );
  assert.throws(
    () =>
      abilityDefinition("ability-basic-melee", {
        ...definition.source,
        sha256: "0".repeat(64),
      }),
    /needs review/,
  );
});

test("target Evasion and actual-target Grappled join the shared attack math", () => {
  const targetTokenUuid = "Scene.synthetic.Token.target",
    basis = {
      attribute: 2,
      mode: "attack",
      contributions: [],
      benefits: [],
      targetTokenUuid,
      targetContributions: [
        {
          id: "held",
          key: "grappled",
          rating: 2,
          persistence: "maintained",
          source: "Grappler",
        },
      ],
      targetEvasion: { boons: 1, banes: 1 },
    },
    plan = prepareRoll(basis, {
      boons: 1,
      banes: 0,
      boonsLabel: "High ground",
      banesLabel: "Obstacle",
    });
  assert.deepEqual(
    plan.sources.map((source) => [
      source.label,
      source.kind,
      source.amount,
    ]),
    [
      ["Target is Grappled", "boon", 2],
      ["Target Evasion · Boons", "boon", 1],
      ["Target Evasion · Banes", "bane", 1],
      ["High ground", "boon", 1],
    ],
  );
  assert.equal(plan.boons, 4);
  assert.equal(plan.banes, 1);
  assert.equal(plan.canceled, 1);
  assert.equal(plan.formula, "6d6kh3 + (2)");
  assert.deepEqual(
    targetEvasionSources({ boons: 0, banes: 2 }, targetTokenUuid),
    [
      {
        id: "target-evasion-banes",
        kind: "bane",
        amount: 2,
        label: "Target Evasion · Banes",
        automatic: true,
        sourceIds: [targetTokenUuid],
      },
    ],
  );
  assert.throws(
    () => targetEvasionSources({ boons: -1, banes: 0 }, targetTokenUuid),
    /nonnegative/,
  );
});

test("native adjacency uses square spaces and requires explicit geometry evidence", () => {
  const base = {
    actorTokenUuid: "Scene.s.Token.a",
    targetTokenUuid: "Scene.s.Token.b",
    sceneUuid: "Scene.s",
    actorLevel: "level",
    targetLevel: "level",
  };
  assert.equal(
    nativeBasicMeleeGeometry({
      ...base,
      spaces: 1,
      accessible: true,
    }).status,
    "adjacent",
  );
  assert.equal(
    nativeBasicMeleeGeometry({
      ...base,
      spaces: 1,
      accessible: false,
    }).status,
    "unverified",
  );
  assert.equal(
    nativeBasicMeleeGeometry({
      ...base,
      spaces: null,
      accessible: null,
    }).status,
    "unverified",
  );
  assert.equal(
    nativeBasicMeleeGeometry({
      ...base,
      spaces: 1.5,
      accessible: true,
    }).status,
    "not-adjacent",
  );
  assert.equal(
    nativeBasicMeleeGeometry({
      ...base,
      spaces: 1,
      accessible: true,
      targetElevation: 5,
    }).status,
    "unverified",
  );
  assert.equal(
    nativeBasicMeleeGeometry({
      ...base,
      spaces: 1,
      accessible: true,
      targetLevel: "other",
    }).status,
    "unverified",
  );
  assert.throws(
    () =>
      nativeBasicMeleeGeometry({
        actorTokenUuid: "Scene.s.Token.same",
        targetTokenUuid: "Scene.s.Token.same",
        sceneUuid: "Scene.s",
        spaces: 1,
        accessible: true,
      }),
    /different tokens/,
  );
});

test("nearest line selection prefers a clear same-distance footprint pair", () => {
  const blocked = {
      spaces: 1,
      origin: { id: "origin-left" },
      destination: { id: "destination-blocked" },
    },
    clear = {
      spaces: 1,
      origin: { id: "origin-right" },
      destination: { id: "destination-clear" },
    },
    fartherClear = {
      spaces: 2,
      origin: { id: "origin-left" },
      destination: { id: "destination-far" },
    },
    collision = (origin, destination) =>
      destination.id === "destination-clear"
        ? true
        : destination.id === "destination-blocked"
          ? false
          : null;
  assert.equal(
    nearestAccessibleLine([blocked, clear, fartherClear], collision)
      .destination.id,
    "destination-clear",
  );
  assert.equal(
    nearestAccessibleLine([blocked, fartherClear], collision).destination.id,
    "destination-blocked",
  );
});

test("Basic Melee request freezing keeps reviewed shared source fields", () => {
  const frozen = {
    woundModifiers: [
      {
        id: "wound-1",
        applications: ["physical"],
        label: "Wounded arm",
      },
    ],
    sources: [
      {
        id: "reviewed-source",
        kind: "bane",
        amount: 1,
        label: "Reviewed source",
        woundApplicability: { physical: true },
      },
    ],
  };
  assert.equal(
    basicMeleeRequestMatches(structuredClone(frozen), frozen),
    true,
  );
  assert.equal(
    basicMeleeRequestMatches(
      {
        ...structuredClone(frozen),
        woundModifiers: [],
      },
      frozen,
    ),
    false,
  );
});

test("Basic Melee wound sources require and retain explicit applicability", () => {
  const wound = {
      effectId: "effect-physical",
      id: "wound-roll-effect-physical",
      woundEventId: "wound-event-physical",
      woundId: "wound-physical-346",
      injury: "Leg: torn knee ligaments",
      source: {
        path: "design/rules/wounds.md",
        sha256: "a".repeat(64),
      },
      sourceCommit: "9bc9b4fe3256e68880b92c45facf0f25b98a1ea3",
      kind: "rollModifier",
      polarity: "bane",
      amount: 1,
      context: "physical",
      printedContext: "physical activities",
      requiresContext: true,
      label: "Wound: Leg: torn knee ligaments · physical activities",
      sourceIds: ["effect-physical"],
    },
    basis = {
      mode: "attack",
      attribute: 2,
      contributions: [],
      benefits: [],
      targetContributions: [],
      targetEvasion: null,
      targetTokenUuid: "Scene.synthetic.Token.target",
      woundModifiers: [wound],
    },
    draft = { woundApplicability: { "effect-physical": "applies" } };
  assert.throws(
    () => prepareRoll(basis, { woundApplicability: {} }),
    /Choose whether each wound modifier applies/,
  );
  assert.equal(
    prepareRoll(basis, draft).sources.some(
      (source) => source.id === wound.id,
    ),
    true,
  );
  assert.equal(
    prepareRoll(basis, {
      woundApplicability: { "effect-physical": "does-not-apply" },
    }).sources.some((source) => source.id === wound.id),
    false,
  );
  assert.equal(
    woundApplicabilityMatches(
      { woundApplicability: { "effect-physical": "applies" } },
      draft,
    ),
    true,
  );
  assert.equal(
    woundApplicabilityMatches(
      { woundApplicability: { "effect-physical": "does-not-apply" } },
      draft,
    ),
    false,
  );
  assert.equal(
    woundApplicabilityMatches(
      {
        woundApplicability: {
          "effect-mental": "does-not-apply",
          "effect-physical": "applies",
        },
      },
      {
        woundApplicability: {
          "effect-physical": "applies",
          "effect-mental": "does-not-apply",
        },
      },
    ),
    true,
  );
  assert.equal(woundApplicabilityMatches({}, draft), false);
});

test("native target visibility hides unseen targets from players only", () => {
  const visible = { object: { isVisible: true } },
    invisible = { hidden: false, object: { isVisible: false } },
    hidden = { hidden: true, object: { isVisible: false } },
    gmVisibleHidden = { hidden: true, object: { isVisible: true } },
    unavailable = {
      get object() {
        throw new Error("Canvas unavailable");
      },
    },
    player = { isGM: false },
    gm = { isGM: true };
  assert.equal(targetVisibleToRequester(visible, player), true);
  assert.equal(targetVisibleToRequester(invisible, player), false);
  assert.equal(targetVisibleToRequester(hidden, player), false);
  assert.equal(targetVisibleToRequester(gmVisibleHidden, player), false);
  assert.equal(targetVisibleToRequester(unavailable, player), false);
  assert.equal(targetVisibleToRequester(visible, gm), true);
  assert.equal(targetVisibleToRequester(invisible, gm), true);
  assert.equal(targetVisibleToRequester(hidden, gm), true);
  assert.equal(targetVisibleToRequester(gmVisibleHidden, gm), true);
});

test("only the matching player attack ID suppresses a pending action", () => {
  const operations = {
    "deleted-player-attack": { operationId: "deleted-player-attack" },
  };
  assert.equal(
    pendingAbilityIsPlayerAttack("ordinary-action", operations),
    false,
  );
  assert.equal(
    pendingAbilityIsPlayerAttack("deleted-player-attack", operations),
    true,
  );
  assert.equal(pendingAbilityIsPlayerAttack("ordinary-action", null), false);
});
