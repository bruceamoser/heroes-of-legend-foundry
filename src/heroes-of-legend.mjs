import { registerWoundRequests } from "./services/wounds.mjs";
import { registerRecoveryRequests } from "./services/recovery.mjs";
import { registerDamageRequests } from "./services/damage.mjs";
import { registerEquipmentRequests } from "./services/equipment.mjs";
import { registerDefenseResponses } from "./services/defense-responses.mjs";
import { registerNpcAttacks } from "./services/npc-attacks.mjs";
import { renderAttackCard } from "./dialogs/defender-choice.mjs";
import { CreatureData } from "./models/creature.mjs";
import { CreatureSheet } from "./sheets/creature.mjs";
import { registerAbilityRequests } from "./services/abilities.mjs";
import { HOLActor } from "./documents/actor.mjs";
import {
  registerHOLStatuses,
  registerConditionRequests,
} from "./services/conditions.mjs";
import { HOLCombat } from "./documents/combat.mjs";
import { registerCombatRequests } from "./services/combat.mjs";
import { renderHOLCombatTracker } from "./applications/combat-tracker.mjs";
import { registerAuthorityPanel } from "./applications/authority.mjs";
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
  CONFIG.Actor.documentClass = HOLActor;
  registerHOLStatuses();
  registerConditionRequests();
  registerEquipmentRequests();
  registerDamageRequests();
  registerRecoveryRequests();
  registerWoundRequests();
  registerAbilityRequests();
  registerNpcAttacks();
  registerDefenseResponses();
  CONFIG.Combat.documentClass = HOLCombat;
  registerCombatRequests();
  registerAuthorityPrototype();
  registerCreationAuthority();
  registerAdvancement();
  registerAuthorityPanel();
  registerTimingPrototype();
  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Actor.dataModels.creature = CreatureData;
  CONFIG.Item.dataModels.ability = AbilityData;
  CONFIG.Item.dataModels.equipment = EquipmentData;
  const sheets = foundry.applications.apps.DocumentSheetConfig;
  sheets.registerSheet(Actor, SYSTEM_ID, CreatureSheet, {
    types: ["creature"],
    makeDefault: true,
  });
  sheets.registerSheet(Actor, SYSTEM_ID, CharacterSheet, {
    types: ["character"],
    makeDefault: true,
  });
  sheets.registerSheet(Item, SYSTEM_ID, AbilitySheet, {
    types: ["ability"],
    makeDefault: true,
  });
  sheets.registerSheet(Item, SYSTEM_ID, EquipmentSheet, {
    types: ["equipment"],
    makeDefault: true,
  });
  console.info(`${SYSTEM_ID} | Initializing package foundation`);
});

Hooks.once("ready", () => {
  if (game.user.isGM) ui.notifications.info(game.i18n.localize("HOL.Preview"));
});

Hooks.on("renderChatMessageHTML", renderRollSummary);

Hooks.on("renderCombatTracker", renderHOLCombatTracker);

Hooks.on("renderChatMessageHTML", renderAttackCard);
