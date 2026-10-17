import { declareNpcMelee } from "../services/npc-attacks.mjs";
import { CharacterSheet } from "./character.mjs";
import {
  creatureReferenceHtml,
  creatureModifierLabel,
} from "./creature-reference.mjs";

function sourceLink(source, commit) {
  const path = source?.path
    ?.split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return source?.path && commit
    ? `https://github.com/bruceamoser/heroes-of-legend/blob/${commit}/${path}`
    : "";
}

export class CreatureSheet extends CharacterSheet {
  static DEFAULT_OPTIONS = {
    classes: ["hol-creature"],
    actions: { npcMelee: CreatureSheet.npcMelee },
    position: { width: 740, height: 800 },
  };
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;
    const flags = this.actor.getFlag("heroes-of-legend", "automation")
      ? {
          catalogId: this.actor.getFlag("heroes-of-legend", "catalogId"),
          source: this.actor.getFlag("heroes-of-legend", "source"),
          sourceCommit: this.actor.getFlag(
            "heroes-of-legend",
            "sourceCommit",
          ),
          automation: this.actor.getFlag("heroes-of-legend", "automation"),
          automationLabel: this.actor.getFlag(
            "heroes-of-legend",
            "automationLabel",
          ),
          classification: this.actor.getFlag(
            "heroes-of-legend",
            "classification",
          ),
          family: this.actor.getFlag("heroes-of-legend", "family"),
        }
      : {};
    const referenceHtml = creatureReferenceHtml(system);
    return {
      ...context,
      gm: game.user.isGM,
      sourceLink: sourceLink(flags.source, flags.sourceCommit),
      sourcePath: flags.source?.path ?? "",
      sourceCommit: flags.sourceCommit ?? "",
      catalogId: flags.catalogId ?? "",
      family: flags.family ?? "",
      classification: flags.classification ?? null,
      automation: flags.automation ?? "",
      automationLabel: flags.automationLabel ?? "",
      evasionLabel: creatureModifierLabel(system.evasion),
      threatLabel: creatureModifierLabel(system.threat),
      alternateSpeeds: system.alternateSpeeds.map(({ mode, value }) => ({
        mode: mode[0].toUpperCase() + mode.slice(1),
        value,
      })),
      referenceHTML: referenceHtml
        ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            referenceHtml,
            { relativeTo: this.actor, links: false },
          )
        : "",
    };
  }
  static async npcMelee() {
    try {
      const blockable = this.element.querySelector("[data-npc-blockable]")
        ?.value;
      await declareNpcMelee(this.actor, {
        blockable: blockable === "" ? undefined : blockable === "true",
      });
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/creature.hbs",
      scrollable: [""],
    },
  };
}
