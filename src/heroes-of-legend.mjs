import {registerNativeMovement} from "./services/native-movement.mjs";
import { registerHOLTheme } from "./applications/theme.mjs";
import { registerItemIcons } from "./services/item-icons.mjs";
import { registerResupplyRequests } from "./services/resupply.mjs";
import { registerCraftingRequests } from "./services/crafting.mjs";
import { registerWoundTreatmentRequests } from "./services/wound-treatment.mjs";
import { registerRulesLibrary } from "./applications/journals.mjs";
import { registerSurvivalRequests } from "./services/survival.mjs";
import { registerWoundRequests } from "./services/wounds.mjs";
import { registerRecoveryRequests } from "./services/recovery.mjs";
import { registerDamageRequests } from "./services/damage.mjs";
import { registerEquipmentRequests } from "./services/equipment.mjs";
import { registerInventoryRequests } from "./services/inventory.mjs";
import {
  registerPotionRequests,
  renderPotionProposal,
} from "./services/potions.mjs";
import { registerDefenseResponses } from "./services/defense-responses.mjs";
import { registerNpcAttacks } from "./services/npc-attacks.mjs";
import { registerItemShortcuts, SHORTCUT_API } from "./services/shortcuts.mjs";
import {
  registerPlayerBasicMeleeRequests,
  renderPlayerBasicMeleeCard,
} from "./services/player-attacks.mjs";
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
import { registerAdvancement } from "./services/advancement.mjs";
import { registerCreationAuthority } from "./services/creation.mjs";
import { registerLanguageSettings } from "./applications/languages.mjs";
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
  registerNativeMovement();
  registerConditionRequests();
  registerEquipmentRequests();
  registerInventoryRequests();
  registerItemIcons();
  registerResupplyRequests();
  registerCraftingRequests();
  registerPotionRequests();
  registerItemShortcuts();
  registerRecoveryRequests();
  registerWoundRequests();
  registerWoundTreatmentRequests();
  registerSurvivalRequests();
  CONFIG.Combat.documentClass = HOLCombat;
  registerCombatRequests();
  registerAuthorityPrototype();
  registerCreationAuthority();
  registerLanguageSettings();
  registerRulesLibrary();
  registerHOLTheme();
  registerAdvancement();
  // Explicit actions do not require an automation management panel.
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
  Object.defineProperty(game, "heroesOfLegend", {
    value: SHORTCUT_API,
    enumerable: true,
  });
});

Hooks.on("renderChatMessageHTML", renderRollSummary);

Hooks.on("renderChatMessageHTML", renderPotionProposal);

Hooks.on("renderCombatTracker", renderHOLCombatTracker);


Hooks.on("renderChatMessageHTML", renderAttackCard);
Hooks.on("renderChatMessageHTML", renderPlayerBasicMeleeCard);

Hooks.once("ready",()=>{void import("./services/journals.mjs").then(({repairRuleChapterPages})=>repairRuleChapterPages()).catch(error=>console.warn("heroes-of-legend | Chapter contents",error));});

Hooks.once("ready",()=>{void (async()=>{
  const {linkCharacterTokens}=await import("./services/character-token-links.mjs");
  await linkCharacterTokens();
  if(game.user.isGM&&game.users.activeGM?.isSelf){
    const {repairRecoveredWoundEffects}=await import("./services/wound-treatment.mjs");
    for(const actor of game.actors)await repairRecoveredWoundEffects(actor);
  }
})().catch(error=>{console.error("heroes-of-legend | Character recovery",error);ui.notifications.error("Character recovery could not finish. Existing token data is preserved; see the console for details.");});});
