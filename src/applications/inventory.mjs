import {
  inventoryBasis,
  requestInventoryAbandon,
  requestInventory,
  requestInventoryRecovery,
  requestInventoryResume,
} from "../services/inventory.mjs";

export class InventoryPanel extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  constructor(actor, itemId = null) {
    super();
    this.actor = actor;
    this.itemId = itemId;
  }

  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-inventory"],
    window: { title: "Supply check", resizable: true },
    position: { width: 620, height: 590 },
    actions: {
      check: InventoryPanel.check,
      recover: InventoryPanel.recover,
      resume: InventoryPanel.resume,
      abandon: InventoryPanel.abandon,
    },
  };

  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/inventory.hbs",
      scrollable: [""],
    },
  };

  async _prepareContext() {
    if (!this.actor.testUserPermission(game.user, "OBSERVER"))
      throw new Error("You cannot inspect this character’s supply.");
    const pending = this.actor.getFlag("heroes-of-legend", "pendingInventory");
    const selectedId = pending?.target?.itemId ?? this.itemId,
      item = this.actor.items.get(selectedId),
      basis = !pending && item ? inventoryBasis(this.actor, item) : null;
    const target = pending?.target ?? basis?.item ?? null;
    this.target = target;
    this.pending = pending;
    this.basis = basis;
    return {
      actorName: this.actor.name,
      owner: this.actor.testUserPermission(game.user, "OWNER"),
      gm: game.user.isGM,
      target,
      die: target?.inventoryDie ?? 0,
      out: target?.inventoryDie === 0,
      pending,
      reserved: pending?.phase === "reserved",
      result: pending?.phase === "result",
      canCheck: Boolean(
        target?.inventoryDie > 0 &&
          !pending &&
          this.actor.testUserPermission(game.user, "OWNER"),
      ),
    };
  }

  static async check() {
    try {
      const item = this.target && this.actor.items.get(this.target.itemId);
      if (!item) throw new Error("The checked item is unavailable.");
      const reason = this.element.querySelector("[name=reason]")?.value;
      await requestInventory(this.actor, item, reason, this.basis);
      await this.close();
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }

  static async recover() {
    try {
      const retainedFace = Number(
          this.element.querySelector("[name=retainedFace]")?.value,
        ),
        reason = this.element.querySelector("[name=recoveryReason]")?.value;
      await requestInventoryRecovery(
        this.actor,
        this.pending.target.itemId,
        retainedFace,
        reason,
      );
      ui.notifications.info(
        "Supply check submitted.",
      );
      await this.close();
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }

  static async resume() {
    try {
      await requestInventoryResume(this.actor);
      ui.notifications.info(
        "Supply check submitted.",
      );
      await this.close();
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }

  static async abandon() {
    try {
      const reason = this.element.querySelector("[name=abandonReason]")?.value;
      await requestInventoryAbandon(this.actor, reason);
      ui.notifications.info(
        "Supply check submitted.",
      );
      await this.close();
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }
}
