import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFENSE_SUBSTITUTIONS,
  defenseSubstitutionOptions,
} from "../src/rules/defense-substitutions.mjs";
import { prepareRoll } from "../src/services/roll-preparation.mjs";

const actor = {
  uuid: "Actor.defender",
  system: {
    attributes: {
      agility: { effective: 1 },
      brawn: { effective: 3 },
      knowledge: { effective: 4 },
      reason: { effective: 2 },
    },
  },
  items: [],
};

function card(id, valid = true) {
  const rule = DEFENSE_SUBSTITUTIONS[id],
    item = {
      uuid: `${actor.uuid}.Item.${id}`,
      type: "ability",
      actor,
      name: id,
      getFlag: (_scope, field) =>
        field === "catalogId"
          ? id
          : field === "source"
            ? { path: rule.path, sha256: valid ? rule.sha256 : "changed" }
            : null,
    };
  return item;
}

function basis(options) {
  return {
    mode: "defense",
    attributeKey: "agility",
    attribute: 1,
    contributions: [],
    woundModifiers: [],
    benefits: [],
    incoming: null,
    defenseSubstitutions: options,
  };
}

test("only exact embedded source editions offer the four substitution choices", () => {
  actor.items = [
    ...Object.keys(DEFENSE_SUBSTITUTIONS).map((id) => card(id)),
    card("ability-snare-the-missile", false),
    { ...card("ability-steel-at-the-wrist"), actor: { uuid: "Actor.other" } },
  ];
  const options = defenseSubstitutionOptions(actor);
  assert.equal(options.length, 4);
  assert.deepEqual(
    Object.fromEntries(
      options.map((option) => [
        option.catalogId,
        [option.attributeKey, option.boons],
      ]),
    ),
    {
      "ability-catch-the-mechanism": ["knowledge", 0],
      "ability-steel-at-the-wrist": ["brawn", 0],
      "ability-snare-the-missile": ["knowledge", 1],
      "ability-thought-before-the-blow": ["reason", 1],
    },
  );
});

test("one existing defense roll uses selected stat and its printed Boon", () => {
  actor.items = Object.keys(DEFENSE_SUBSTITUTIONS).map((id) => card(id));
  const options = defenseSubstitutionOptions(actor),
    context = basis(options);
  const ordinary = prepareRoll(context);
  assert.equal(ordinary.formula, "3d6 + (1)");
  assert.equal(ordinary.resolvedAttributeKey, "agility");
  assert.equal(ordinary.defenseSubstitutionItemUuid, null);
  for (const option of options) {
    const plan = prepareRoll(context, {
      defenseSubstitutionItemUuid: option.itemUuid,
    });
    assert.equal(plan.attribute, option.attribute);
    assert.equal(plan.resolvedAttributeKey, option.attributeKey);
    assert.equal(plan.boons, option.boons);
    assert.equal(
      plan.sources.filter((source) =>
        source.id.startsWith("defense-substitution-"),
      ).length,
      option.boons ? 1 : 0,
    );
  }
  assert.throws(
    () =>
      prepareRoll(context, {
        defenseSubstitutionItemUuid: "Actor.defender.Item.unowned",
      }),
    /changed/,
  );
  assert.throws(
    () =>
      prepareRoll(
        { ...context, mode: "attack" },
        { defenseSubstitutionItemUuid: options[0].itemUuid },
      ),
    /defense roll/,
  );
});

test("removing or revising the owned card invalidates its pending selection", () => {
  const item = card("ability-thought-before-the-blow");
  actor.items = [item];
  const selected = defenseSubstitutionOptions(actor)[0],
    context = basis([selected]);
  const draft = { defenseSubstitutionItemUuid: selected.itemUuid };
  assert.equal(prepareRoll(context, draft).resolvedAttributeKey, "reason");
  item.getFlag = (_scope, field) =>
    field === "catalogId"
      ? selected.catalogId
      : field === "source"
        ? { path: selected.source.path, sha256: "changed" }
        : null;
  const refreshed = basis(defenseSubstitutionOptions(actor));
  assert.notDeepEqual(refreshed, context);
  assert.throws(() => prepareRoll(refreshed, draft), /changed/);
});
