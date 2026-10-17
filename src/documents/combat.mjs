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
        "Choose an unacted participant from the indicated side.",
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
      "Encounter history is preserved. Rewind needs a DA correction; it does not refund actions or effects automatically.",
    );
    return this;
  }
  async previousRound() {
    return this.previousTurn();
  }
  async rollInitiative() {
    ui.notifications.info(
      "HOL uses one opening roll and side-selected turns. Start the encounter instead of rolling individual initiative.",
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
