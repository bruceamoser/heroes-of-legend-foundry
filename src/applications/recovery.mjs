import { requestSurvival } from "../services/survival.mjs";
import { damageBasis } from "../services/damage.mjs";
import { recoveryPreview, requestRecovery } from "../services/recovery.mjs";
export class RecoveryPanel extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  constructor(actor) {
    super();
    this.actor = actor;
  }
  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-recovery"],
    window: { title: "Health and recovery", resizable: true },
    position: { width: 660, height: 650 },
    actions: {
      apply: RecoveryPanel.apply,
      recoverDeath: RecoveryPanel.recoverDeath,
    },
  };
  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/recovery.hbs",
      scrollable: [""],
    },
  };
  async _prepareContext() {
    if (!game.user.isGM)
      throw new Error("Only the DA records recovery or corrections.");
    this.basis = damageBasis(this.actor);
    return {
      name: this.actor.name,
      pendingDeath: Boolean(
        this.actor.getFlag("heroes-of-legend", "pendingDeath"),
      ),
      basis: this.basis,
      character: this.actor.type === "character",
      automaticLifeResistance: Math.min(
        3,
        Math.max(
          0,
          ...(this.basis.passiveDefenses?.resistances ?? [])
            .filter((source) => source.type === "life")
            .map((source) => source.value),
        ),
      ),
      wounds: this.basis.survival?.wounds ?? 0,
      marks: this.basis.survival?.marks ?? 0,
      statuses: ["active", "dying", "stable", "lastWords", "dead"].map(
        (value) => ({
          value,
          selected:
            value ===
            (this.basis.survival?.status ??
              (this.basis.hp > 0 ? "active" : "dying")),
        }),
      ),
    };
  }
  draft() {
    const value = (name) => this.element.querySelector(`[name=${name}]`)?.value;
    return {
      kind: value("kind"),
      reason: value("reason"),
      amount: Number(value("amount")),
      lifeResistance: Number(value("lifeResistance")),
      hp: Number(value("hp")),
      status: value("status"),
      wounds: Number(value("wounds")),
      marks: Number(value("marks")),
    };
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    const preview = () => {
      const draft = this.draft();
      for (const part of this.element.querySelectorAll("[data-kind]"))
        part.hidden = part.dataset.kind !== draft.kind;
      const output = this.element.querySelector("[data-preview]");
      try {
        const plan = recoveryPreview(this.actor, this.basis, draft);
        output.textContent = `HP ${this.basis.hp} → ${plan.after}${plan.state ? ` · ${plan.state.status}` : ""}`;
      } catch (e) {
        output.textContent = e.message;
      }
    };
    this.element.addEventListener("input", preview);
    this.element.addEventListener("change", preview);
    preview();
  }
  static async recoverDeath() {
    try {
      const retained = this.element
          .querySelector("[name=deathFaces]")
          .value.split(",")
          .map((s) => Number(s.trim())),
        reason = this.element.querySelector("[name=deathReason]").value;
      await requestSurvival(this.actor, null, { retained, reason }, "recover");
      await this.close();
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static async apply() {
    try {
      const draft = this.draft();
      recoveryPreview(this.actor, this.basis, draft);
      await requestRecovery(this.actor, this.basis, draft);
      await this.close();
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
}
