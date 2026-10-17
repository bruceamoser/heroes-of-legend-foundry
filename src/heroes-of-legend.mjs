import { registerAdvancement } from "./services/advancement.mjs";
import { registerCreationAuthority } from "./services/creation.mjs";
import { EquipmentData } from "./models/equipment.mjs";
import { EquipmentSheet } from "./sheets/equipment.mjs";
import { registerTimingPrototype } from "./prototypes/timing.mjs";
import { registerAuthorityPrototype } from "./prototypes/authority.mjs";
import { renderRollSummary } from "./services/roll.mjs";
import { CharacterData } from "./models/character.mjs";
import { AbilityData } from "./models/ability.mjs";
import { CharacterSheet } from "./sheets/character.mjs";
import { AbilitySheet } from "./sheets/ability.mjs";
/** Native V14 package entry point. No legacy compatibility layer. */
export const SYSTEM_ID = "heroes-of-legend";

Hooks.once("init", () => {
  registerAuthorityPrototype();
  registerCreationAuthority();
  registerAdvancement();
  registerTimingPrototype();
  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Item.dataModels.ability = AbilityData;
  CONFIG.Item.dataModels.equipment = EquipmentData;
  const sheets = foundry.applications.apps.DocumentSheetConfig;
  sheets.registerSheet(Actor, SYSTEM_ID, CharacterSheet, { types: ["character"], makeDefault: true });
  sheets.registerSheet(Item, SYSTEM_ID, AbilitySheet, { types: ["ability"], makeDefault: true });
  sheets.registerSheet(Item, SYSTEM_ID, EquipmentSheet, { types: ["equipment"], makeDefault: true });
  console.info(`${SYSTEM_ID} | Initializing package foundation`);
});

Hooks.once("ready", () => {
  if (game.user.isGM) ui.notifications.info(game.i18n.localize("HOL.Preview"));
});

Hooks.on("renderChatMessageHTML", renderRollSummary);
