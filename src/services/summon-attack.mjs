import {summonAttackConfiguration} from "../rules/creature-sheet-profile.mjs";
import {SharedRollDialog} from "../dialogs/attribute-roll.mjs";

export function promptSummonAttack(actor,id="basic-melee") {
  if (!actor.testUserPermission(game.user,"OWNER")) throw new Error("Use a creature you own.");
  const configuration=summonAttackConfiguration(actor,id);
  const dialog=new SharedRollDialog(actor,configuration.attribute,{mode:"attack"});
  dialog.draft.summonAttackId=id;
  dialog.draft.abilityConfiguration=configuration;
  // The existing situational-source channel preserves the printed attack modifier.
  dialog.draft.boons=configuration.attackModifier.boons;
  dialog.draft.banes=configuration.attackModifier.banes;
  dialog.draft.boonsLabel="Printed attack modifier";
  dialog.draft.banesLabel="Printed attack modifier";
  return dialog.render({force:true});
}
