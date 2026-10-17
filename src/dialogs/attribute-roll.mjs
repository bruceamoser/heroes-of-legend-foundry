import { rollAttribute } from "../services/roll.mjs";
import { rollPlan } from "../rules/roll.mjs";

/** Foundation check dialog. Ability choices and action costs are the U01 workflow. */
export async function promptAttributeRoll(actor, attributeKey) {
  if (!actor.isOwner) return;
  const attribute = actor.system.attributes[attributeKey].effective;
  const content = await foundry.applications.handlebars.renderTemplate("systems/heroes-of-legend/templates/attribute-roll.hbs", {
    attribute, formula: rollPlan({ attribute }).formula
  });
  const choice = await foundry.applications.api.DialogV2.input({
    window: { title: game.i18n.localize(`HOL.Attributes.${attributeKey}`) },
    classes: ["heroes-of-legend", "hol-roll-dialog"], position: { width: 420 }, content,
    ok: { label: "HOL.Roll" },
    render: (event, dialog) => {
      const element = dialog.element;
      element.addEventListener("input", () => {
        try {
          const boons = Number(element.querySelector('[name="boons"]').value);
          const banes = Number(element.querySelector('[name="banes"]').value);
          const plan = rollPlan({ attribute, boons, banes });
          element.querySelector("output").textContent = plan.formula;
        } catch { element.querySelector("output").textContent = game.i18n.localize("HOL.InvalidModifiers"); }
      });
    }
  });
  if (!choice) return;
  return rollAttribute(actor, attributeKey, { boons: Number(choice.boons), banes: Number(choice.banes) });
}
