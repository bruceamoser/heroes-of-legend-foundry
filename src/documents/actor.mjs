import { ConditionPanel } from "../applications/conditions.mjs";
export class HOLActor extends foundry.documents.Actor {
  async toggleStatusEffect(statusId, options = {}) {
    if (
      typeof statusId === "string" &&
      statusId.startsWith("hol.") &&
      CONFIG.statusEffects[statusId]
    ) {
      // A HUD toggle must not erase multiple independently sourced conditions.
      await new ConditionPanel(this, statusId.slice(4)).render({ force: true });
      return this.statuses.has(statusId);
    }
    return super.toggleStatusEffect(statusId, options);
  }
}
