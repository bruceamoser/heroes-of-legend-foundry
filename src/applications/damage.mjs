import { DAMAGE_TYPES } from "../rules/damage.mjs";
import {
  damageBasis,
  damagePreview,
  requestDamage,
  defenseDamage,
} from "../services/damage.mjs";
import { playerBasicMeleeDamage } from "../services/player-attacks.mjs";
export class DamagePanel extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  constructor(actor, rollMessageId = null, attackMessageId = null) {
    super();
    this.actor = actor;
    this.rollMessageId = rollMessageId;
    this.attackMessageId = attackMessageId;
  }
  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-damage"],
    window: { title: "Apply damage", resizable: true },
    position: { width: 720, height: 650 },
    actions: { apply: DamagePanel.apply },
  };
  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/damage.hbs",
      scrollable: [""],
    },
  };
  async _prepareContext() {
    if (!this.actor.testUserPermission(game.user, "OWNER")) throw new Error("Only this actor’s owner can apply damage.");
    this.basis = damageBasis(this.actor);
    const incoming = this.rollMessageId
        ? defenseDamage(game.messages.get(this.rollMessageId))
        : this.attackMessageId
          ? playerBasicMeleeDamage(this.attackMessageId)
          : null;
    if (incoming && incoming.actorUuid !== this.actor.uuid)
      throw new Error(
        this.rollMessageId
          ? "Choose the original defender."
          : "Choose the original Basic Melee target.",
      );
    this.components = incoming?.components ?? [];
    return {
      name: this.actor.name,
      basis: this.basis,
      fromRoll: !!incoming,
      fromAttack: Boolean(this.attackMessageId),
      lockedSource: Boolean(incoming),
      sourceReason: this.attackMessageId
        ? "Settled Basic Melee"
        : "Settled defense",
      automaticDefenses: [
        ...(this.basis.passiveDefenses?.resistances ?? []),
        ...(this.basis.passiveDefenses?.weaknesses ?? []),
      ],
      rows: DAMAGE_TYPES.map((type) => ({
        type,
        amount: this.components.find((c) => c.type === type)?.amount ?? 0,
      })),
    };
  }
  draft() {
    const rows = [...this.element.querySelectorAll("[data-damage-type]")],
      components = [],
      resistances = [],
      weaknesses = [];
    for (const row of rows) {
      const type = row.dataset.damageType;
      for (const [field, list, key] of [
        ["amount", components, "amount"],
        ["resistance", resistances, "value"],
        ["weakness", weaknesses, "value"],
      ]) {
        const value = Number(row.querySelector(`[name=${field}]`).value);
        if (value !== 0)
          list.push({
            type,
            [key]: value,
            ...(key === "value" ? { label: `DA ${type} ${field}` } : {}),
          });
      }
    }
    return {
      components:
        this.rollMessageId || this.attackMessageId
          ? this.components
          : components,
      resistances,
      weaknesses,
      reason: this.element.querySelector("[name=reason]").value,
    };
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    const preview = () => {
      const output = this.element.querySelector("[data-preview]");
      try {
        const plan = damagePreview(this.actor, this.basis, this.draft());
        output.textContent = `${plan.event.total} damage · HP ${this.basis.hp} → ${plan.after}${plan.survival ? ` · ${plan.survival.status}` : ""}${plan.wound ? " · New wound" : ""}`;
      } catch (e) {
        output.textContent = e.message;
      }
    };
    this.element.addEventListener("input", preview);
    preview();
  }
  static async apply() {
    try {
      const draft = this.draft();
      damagePreview(this.actor, this.basis, draft);
      await requestDamage(
        this.actor,
        this.basis,
        draft,
        this.rollMessageId,
        this.attackMessageId,
      );
      await this.close();
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
}
export async function openDefenseDamage(message) {
  const data = defenseDamage(message),
    actor = await fromUuid(data.actorUuid);
  return new DamagePanel(actor, message.id).render({ force: true });
}

export async function openPlayerAttackDamage(messageOrId) {
  const data = playerBasicMeleeDamage(messageOrId),
    attackMessageId =
      typeof messageOrId === "string" ? messageOrId : messageOrId?.id,
    actor = await fromUuid(data.actorUuid);
  if (
    actor?.documentName !== "Actor" ||
    actor.uuid !== data.actorUuid
  )
    throw new Error("The Basic Melee target is unavailable.");
  return new DamagePanel(actor, null, attackMessageId).render({ force: true });
}
