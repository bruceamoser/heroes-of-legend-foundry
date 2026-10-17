import { equipmentBasis, requestEquipment } from "../services/equipment.mjs";
import { handLayout } from "../rules/hands.mjs";
export class EquipmentPanel extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  constructor(actor) {
    super();
    this.actor = actor;
  }
  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-hands"],
    window: { title: "Hands and equipment", resizable: true },
    position: { width: 650, height: 600 },
    actions: { save: EquipmentPanel.save },
  };
  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/hands.hbs",
      scrollable: [""],
    },
  };
  async _prepareContext() {
    if (!this.actor.testUserPermission(game.user, "OBSERVER"))
      throw new Error("You cannot inspect this actor.");
    this.basis = equipmentBasis(this.actor);
    let summary;
    try {
      const state = handLayout(this.basis.items, this.basis.capacity);
      summary = `${state.occupied} occupied · ${state.free} free`;
    } catch (e) {
      summary = e.message;
    }
    return {
      name: this.actor.name,
      capacity: this.basis.capacity,
      summary,
      gm: game.user.isGM,
      encounter: this.basis.encounters.length > 0,
      editable:
        this.actor.isOwner && (!this.basis.encounters.length || game.user.isGM),
      items: this.basis.items.map((i) => ({
        ...i,
        name: this.actor.items.get(i.id).name,
      })),
    };
  }
  arrangement() {
    return {
      items: [...this.element.querySelectorAll("[data-equipment-id]")].map(
        (row) => ({
          id: row.dataset.equipmentId,
          hands: Number(row.querySelector("[name=hands]").value),
          held: row.querySelector("[name=held]").checked,
        }),
      ),
      capacity: Number(this.element.querySelector("[name=capacity]").value),
    };
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.addEventListener("input", () => {
      const output = this.element.querySelector("[data-hand-summary]");
      try {
        const { items, capacity } = this.arrangement(),
          state = handLayout(items, capacity);
        output.textContent = `${state.occupied} occupied · ${state.free} free`;
      } catch (e) {
        output.textContent = e.message;
      }
    });
  }
  static async save() {
    try {
      const { items, capacity } = this.arrangement();
      handLayout(items, capacity);
      await requestEquipment(
        this.actor,
        this.basis,
        items,
        capacity,
        this.element.querySelector("[name=reason]")?.value ?? "",
      );
      await this.close();
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
}
