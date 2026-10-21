import { equipmentBasis, requestEquipment } from "../services/equipment.mjs";
export class EquipmentPanel extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  constructor(actor) {
    super();
    this.actor = actor;
  }
  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-hands"],
    window: { title: "Hands, worn gear and equipment", resizable: true },
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
    return {
      name: this.actor.name,
      capacity: this.basis.capacity,
      gm: game.user.isGM,
      encounter: this.basis.encounters.length > 0,
      editable:
        this.actor.isOwner,
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
          quantity: this.basis.items.find(item => item.id === row.dataset.equipmentId)?.quantity,
          hands: Number(row.querySelector("[name=hands]").value),
          held: row.querySelector("[name=held]").checked,
          worn: row.querySelector("[name=worn]").checked,
        }),
      ),
      capacity: Number(this.element.querySelector("[name=capacity]").value),
    };
  }
  static async save() {
    try {
      const { items, capacity } = this.arrangement();
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
