import { requestCombat } from "../services/combat.mjs";
export class HOLCombat extends foundry.documents.Combat {
  async startCombat() {
    await requestCombat(this, "start");
    return this;
  }
  async nextTurn() {
    if (!this.getFlag("heroes-of-legend", "encounter"))
      return this.startCombat();
    if (!this.getFlag("heroes-of-legend", "encounter").current) {
      ui.notifications.info(
        "Choose a participant.",
      );
      return this;
    }
    await requestCombat(this, "finish");
    return this;
  }
  async nextRound() {
    return this.nextTurn();
  }
  async previousTurn() {
    ui.notifications.warn(
      "Finish the current turn, then choose another participant.",
    );
    return this;
  }
  async previousRound() {
    return this.previousTurn();
  }
  async rollInitiative() {
    ui.notifications.info(
      "Choose a participant in the encounter.",
    );
    return this;
  }
  async rollAll() {
    return this.rollInitiative();
  }
  async rollNPC() {
    return this.rollInitiative();
  }
}
