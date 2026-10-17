import assert from "node:assert/strict";
import test from "node:test";

import {
  isGeneratedShortcutMacro,
  isShortcutItem,
  normalizeHotbarSlot,
  shortcutCommand,
  shortcutProvenance,
} from "../src/services/shortcuts.mjs";

function fixture(type = "ability") {
  const item = {
    id: "item-id",
    documentName: "Item",
    type,
    uuid: "Scene.scene.Token.token.Actor.actor.Item.item-id",
    img: "icons/svg/sword.svg",
  };
  item.actor = {
    id: "actor",
    uuid: "Scene.scene.Token.token.Actor.actor",
    documentName: "Actor",
    items: {
      get: (id) => (id === item.id ? item : undefined),
    },
    testUserPermission: () => true,
  };
  return item;
}

function generatedMacro(item) {
  const flags = {
    "heroes-of-legend": {
      shortcut: shortcutProvenance(item),
    },
  };
  return {
    type: "script",
    scope: "global",
    command: shortcutCommand(item.uuid),
    canUserExecute: () => true,
    getFlag: (scope, key) => flags[scope]?.[key],
  };
}

test("shortcut source validation accepts live actor-bound abilities and equipment", () => {
  assert.equal(isShortcutItem(fixture("ability")), true);
  assert.equal(isShortcutItem(fixture("equipment")), true);
  assert.equal(isShortcutItem(fixture("ancestry")), false);
  assert.equal(isShortcutItem({ ...fixture("ability"), actor: null }), false);
});

test("shortcut command is generated only from the exact live Item UUID", () => {
  const item = fixture();
  assert.equal(
    shortcutCommand(item.uuid),
    'await game.heroesOfLegend.openItem("Scene.scene.Token.token.Actor.actor.Item.item-id");',
  );
  assert.throws(() => shortcutCommand(""), /live Item UUID/);
  assert.deepEqual(shortcutProvenance(item), {
    generator: "item-sheet-shortcut",
    version: 1,
    itemUuid: item.uuid,
    actorUuid: item.actor.uuid,
    itemId: item.id,
    itemType: "ability",
  });
});

test("generated Macro reuse requires matching provenance and exact command", () => {
  const item = fixture(),
    macro = generatedMacro(item);
  assert.equal(isGeneratedShortcutMacro(macro, item), true);
  assert.equal(
    isGeneratedShortcutMacro(
      { ...macro, command: "ui.notifications.error('modified');" },
      item,
    ),
    false,
  );
  const wrongFlag = generatedMacro(item);
  wrongFlag.getFlag = () => ({
    ...shortcutProvenance(item),
    actorUuid: "Actor.someone-else",
  });
  assert.equal(isGeneratedShortcutMacro(wrongFlag, item), false);
  assert.equal(
    isGeneratedShortcutMacro({ ...macro, scope: "actors" }, item),
    false,
  );
});

test("hotbar slots use V14's numbered 1 through 50 range", () => {
  assert.equal(normalizeHotbarSlot("1"), 1);
  assert.equal(normalizeHotbarSlot(50), 50);
  for (const value of [0, 51, 1.5, "", null])
    assert.throws(() => normalizeHotbarSlot(value), /1 to 50/);
});
