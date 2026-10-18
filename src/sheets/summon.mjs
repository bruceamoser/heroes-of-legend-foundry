import { viewPortrait } from "./portrait.mjs";
import { ATTRIBUTES } from "../rules/character.mjs";
import { creatureModifierLabel, renderMarkdown } from "./creature-reference.mjs";

/** Read-only reference sheet: importing a profile never commands or spawns it. */
export class SummonSheet extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.sheets.ActorSheetV2,
) {
  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-summon"],
    actions: { viewPortrait },
    position: { width: 760, height: 820 },
  };
  static PARTS = {
    main: { template: "systems/heroes-of-legend/templates/summon.hbs", scrollable: [""] },
  };
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;
    const flags = this.actor.flags["heroes-of-legend"] ?? {};
    return {
      ...context, actor: this.actor, system,
      attributes: ATTRIBUTES.map(key => ({ label: key[0].toUpperCase() + key.slice(1), value: system.attributes[key].base })),
      defenseLabel: creatureModifierLabel(system.defenseModifier),
      attackLabel: creatureModifierLabel(system.basicMelee.attackModifier),
      catalogId: flags.catalogId ?? "", sourceCommit: flags.sourceCommit ?? "",
      sourcePath: flags.source?.path ?? "",
      referenceHTML: await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        renderMarkdown(system.referenceMarkdown), { relativeTo: this.actor, links: false },
      ),
    };
  }
}
