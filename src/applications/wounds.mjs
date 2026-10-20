import { woundTreatmentBasis, requestWoundTreatment } from "../services/wound-treatment.mjs";
import { woundCatalog, woundBasis, requestWound } from "../services/wounds.mjs";
import { woundResult } from "../rules/wounds.mjs";
export class WoundPanel extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  constructor(actor) {
    super();
    this.actor = actor;
    this.eventId = null;
    this.skipped = [];
    this.effectHooks=["createActiveEffect","updateActiveEffect","deleteActiveEffect"].map(name=>[name,Hooks.on(name,effect=>{if(effect.parent?.uuid===actor.uuid&&this.rendered)void this.render();})]);
    this.hook = Hooks.on("updateActor", (a) => {
      if (a.uuid === actor.uuid && this.rendered) this.render();
    });
  }
  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-wounds"],
    window: { title: "Wounds and scars", resizable: true },
    position: { width: 720, height: 700 },
    actions: {
      record: WoundPanel.record,
      select: WoundPanel.select,
      roll: WoundPanel.roll,
      skip: WoundPanel.skip,
      apply: WoundPanel.apply,
      recover: WoundPanel.recover,
      treat: WoundPanel.treat,
    },
  };
  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/wounds.hbs",
      scrollable: [""],
    },
  };
  async _prepareContext() {
    if (!this.actor.testUserPermission(game.user, "OBSERVER"))
      throw new Error("You cannot inspect these wounds.");
    const pending = Object.values(
      this.actor.getFlag("heroes-of-legend", "pendingWounds") ?? {},
    );
    this.eventId ??=
      pending.find((p) => p.status !== "resolved")?.eventId ??
      pending[0]?.eventId;
    const selected = pending.find((p) => p.eventId === this.eventId);
    this.basis = selected ? woundBasis(this.actor, this.eventId) : null;
    this.result =
      selected?.status === "rolled"
        ? woundResult(
            await woundCatalog(),
            selected.damageType,
            selected.result.key,
            this.skipped,
          )
        : null;
    return {
      name: this.actor.name,
      gm: game.user.isGM,
      owner: this.actor.isOwner,
      events: pending.map((p, index) => ({
        number: index + 1,
        ...p,
        selected: p.eventId === this.eventId,
      })),
      selected,
      awaiting: selected?.status === "awaiting-roll",
      rolling: selected?.status === "rolling",
      result: this.result?.record,
      consequences: this.result?.effects.map((e) =>
        e.kind === "condition"
          ? `${e.key} ${e.rating}${e.persistence === "starred" ? "*" : ""}`
          : e.kind === "movementPenalty"
            ? `Movement reduced by ${e.amount}`
            : e.kind === "rollModifier"
              ? `${e.amount} ${e.polarity} for ${e.context} when applicable`
              : e.kind === "forcedMovement"
                ? `${e.direction} ${e.distance} squares, once; DA placement pending`
                : "Last Words: speech only; death after the second following turn",
      ),
      skipped: this.skipped,
      terminal: this.result?.record.key === "666",
      fear: this.result?.effects.some((e) => e.requiresSource),
      displacement: this.result?.effects.some(
        (e) => e.kind === "forcedMovement",
      ),
      wounds: Object.values(
        this.actor.getFlag("heroes-of-legend", "wounds") ?? {},
      ).map(wound => ({ ...wound, effectSummary:this.actor.effects.filter(effect=>effect.active&&!effect.getFlag("heroes-of-legend","retired")&&effect.getFlag("heroes-of-legend","woundEvent")===wound.eventId).map(effect=>effect.name).join(" · ")||"—", canTreat: this.actor.isOwner && Boolean(wound.recoveryValue) && (wound.recoveryProgress ?? 0) < wound.recoveryValue })),
    };
  }
  async _onClose(options) {
    for(const [name,id]of this.effectHooks)Hooks.off(name,id);
    Hooks.off("updateActor", this.hook);
    return super._onClose(options);
  }
  static async record() {
    try {
      const confirmed = await foundry.applications.api.DialogV2.confirm({classes: ["heroes-of-legend", "hol-native-dialog"],
        window: { title: "Record additional wound" },
        content: "<p>Record one additional wound and increase the accumulated wound count? HP and survival status stay as they are. Existing pending wounds remain available.</p>",
        yes: { label: "Record wound" }, no: { label: "Cancel" },
      });
      if (!confirmed) return;
      const message = await requestWound(this.actor, null, "record");
      this.eventId = `manual-wound-${message.id}`;
      this.skipped = [];
      await this.render();
    } catch (e) { ui.notifications.error(e.message); }
  }
  static async select(event, target) {
    this.eventId = target.dataset.eventId;
    this.skipped = [];
    await this.render();
  }
  static async roll() {
    try {
      await requestWound(this.actor, this.eventId, "roll", {
        damageType: this.element.querySelector("[name=damageType]").value,
      });
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static async skip() {
    try {
      const reason = this.element.querySelector("[name=anatomyReason]").value;
      this.skipped.push({ key: this.result.record.key, reason });
      await this.render();
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static async apply() {
    try {
      await requestWound(this.actor, this.eventId, "apply", {
        basis: this.basis,
        skipped: this.skipped,
        fearSource:
          this.element.querySelector("[name=fearSource]")?.value ?? "",
      });
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static async treat(event, target) {
    target.disabled = true;
    try {
      const row = target.closest("[data-wound-event]");
      const eventId = row.dataset.woundEvent;
      await requestWoundTreatment(this.actor, eventId, Number(row.querySelector("[name=treatmentProgress]").value), woundTreatmentBasis(this.actor, eventId));
    } catch (e) { ui.notifications.error(e.message); }
    finally { if (target.isConnected) target.disabled = false; }
  }
  static async recover() {
    try {
      const faces = this.element
          .querySelector("[name=faces]")
          .value.split(",")
          .map((s) => Number(s.trim())),
        reason = this.element.querySelector("[name=recoveryReason]").value;
      await requestWound(this.actor, this.eventId, "recover", {
        faces,
        reason,
      });
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
}
