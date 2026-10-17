import {
  basicMeleeDialogContext,
  requestPlayerBasicMelee,
} from "../services/player-attacks.mjs";
import { prepareRoll } from "../services/roll-preparation.mjs";

export class BasicMeleeDialog extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  constructor(item, combat, participantId) {
    super();
    this.item = item;
    this.combat = combat;
    this.participantId = participantId;
    this.draft = {
      weaponItemUuid: "",
      targetTokenUuid: "",
      boons: 0,
      banes: 0,
      boonsLabel: "Situational Boons",
      banesLabel: "Situational Banes",
      perception: {},
      woundApplicability: {},
      rulingReason: "",
    };
    this.context = null;
    this.rendered = false;
    this.submitting = false;
  }

  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-roll-dialog", "hol-player-attack"],
    window: { title: "Prepare Basic Melee", resizable: true },
    position: { width: 640, height: 760 },
    actions: {
      attack: BasicMeleeDialog.attack,
    },
  };

  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/player-attack.hbs",
      scrollable: [".hol-body"],
    },
  };

  selection() {
    return {
      weaponItemUuid: this.draft.weaponItemUuid,
      targetTokenUuid: this.draft.targetTokenUuid,
      rulingReason: this.draft.rulingReason,
      draft: this.draft,
    };
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    this.context = basicMeleeDialogContext(
      this.item,
      this.combat,
      this.participantId,
      this.selection(),
    );
    if (!this.draft.weaponItemUuid)
      this.draft.weaponItemUuid = this.context.weaponItemUuid ?? "";
    if (!this.draft.targetTokenUuid)
      this.draft.targetTokenUuid = this.context.targetTokenUuid ?? "";
    const fears = [
      ...new Set(
        (this.context.basis?.contributions ?? [])
          .filter((entry) => entry.key === "frightened")
          .map((entry) => entry.source),
      ),
    ];
    this.fears = fears;
    return {
      ...context,
      gm: game.user.isGM,
      actorName: this.item.actor.name,
      actorTokenName: this.context.actorToken?.name ?? "",
      targetName:
        this.context.targets.find(
          (target) => target.uuid === this.context.targetTokenUuid,
        )?.name ?? "",
      attribute: this.context.basis?.attribute ?? this.item.actor.system.attributes.brawn.effective,
      geometryStatus: this.context.geometry?.status ?? "unavailable",
      geometryReason: this.context.geometry?.reason ?? "",
      sources: this.context.plan?.sources ?? [],
      formula:
        this.context.plan?.formula ??
        "Choose a token, target and held melee weapon.",
      totals: this.context.plan
        ? `${this.context.plan.boons} Boons · ${this.context.plan.banes} Banes · ${this.context.plan.canceled} canceled pairs · net extras ${this.context.plan.net} (maximum 3)`
        : "",
      fears: fears.map((source, index) => ({
        source,
        index,
        yes: this.draft.perception[source] === "yes",
        no: this.draft.perception[source] === "no",
      })),
      canAttack:
        Boolean(this.context.basis) &&
        this.context.reasons.length === 0 &&
        !this.submitting,
    };
  }

  readDraft() {
    const value = (name) =>
      this.element.querySelector(`[name="${name}"]`)?.value;
    this.draft = {
      ...this.draft,
      weaponItemUuid: value("weaponItemUuid") ?? "",
      targetTokenUuid: value("targetTokenUuid") ?? "",
      boons: value("boons") ?? 0,
      banes: value("banes") ?? 0,
      boonsLabel: value("boonsLabel") ?? "Situational Boons",
      banesLabel: value("banesLabel") ?? "Situational Banes",
      perception: Object.fromEntries(
        this.fears.map((source, index) => [
          source,
          value(`fear-${index}`) ?? "",
        ]),
      ),
      rulingReason: value("rulingReason") ?? "",
    };
  }

  preview() {
    const sources = this.element.querySelector(".hol-roll-sources"),
      output = this.element.querySelector("output"),
      totals = this.element.querySelector(".hol-roll-totals"),
      button = this.element.querySelector('[data-action="attack"]');
    sources?.replaceChildren();
    if (!this.context?.basis) {
      if (output) output.textContent = this.context?.reasons.join(" ") ?? "";
      if (button) button.disabled = true;
      return;
    }
    try {
      const plan = prepareRoll(this.context.basis, this.draft);
      for (const source of plan.sources) {
        const li = document.createElement("li");
        li.textContent = `${source.label}: ${source.amount} ${source.kind === "boon" ? "Boon(s)" : "Bane(s)"}${source.automatic ? " · automatic" : ""}`;
        sources?.append(li);
      }
      output.textContent = plan.formula;
      totals.textContent = `${plan.boons} Boons · ${plan.banes} Banes · ${plan.canceled} canceled pairs · net extras ${plan.net} (maximum 3)`;
      button.disabled = this.context.reasons.length > 0 || this.submitting;
    } catch (error) {
      output.textContent = error.message;
      totals.textContent = "";
      button.disabled = true;
    }
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.rendered = true;
    this.element.addEventListener("input", () => {
      this.readDraft();
      this.preview();
    });
    this.element.addEventListener("change", async (event) => {
      if (
        !event.target.closest(
          "[name=weaponItemUuid], [name=targetTokenUuid], [name=rulingReason], [name^=fear-]",
        )
      )
        return;
      this.readDraft();
      await this.render();
    });
    this.preview();
  }

  static async attack() {
    if (this.submitting) return;
    this.readDraft();
    try {
      this.submitting = true;
      await this.render();
      await requestPlayerBasicMelee(
        this.item,
        this.combat,
        this.participantId,
        this.selection(),
      );
      await this.close();
    } catch (error) {
      this.submitting = false;
      ui.notifications.error(error.message);
      if (this.rendered) await this.render();
    }
  }
}

export async function promptBasicMelee(item, combat, participantId) {
  if (!item.actor?.isOwner && !game.user.isGM)
    throw new Error(
      "Use a Basic Melee ability belonging to a character you own, or as the DA.",
    );
  return new BasicMeleeDialog(item, combat, participantId).render({
    force: true,
  });
}
