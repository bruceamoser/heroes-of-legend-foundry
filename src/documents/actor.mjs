import { ConditionPanel } from "../applications/conditions.mjs";
export class HOLActor extends foundry.documents.Actor {
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    if (["character", "creature", "summon"].includes(this.type)) {
      this.updateSource({"prototypeToken.actorLink": this.type === "character"});
    }
  }

  _onUpdate(changes,options,userId) {
    super._onUpdate(changes,options,userId);
    if(userId===game.user.id && changes.system?.health?.value!==undefined) {
      void import("../services/creature-death.mjs").then(({syncCreatureDeath})=>syncCreatureDeath(this)).catch(error=>ui.notifications.error(error.message));
    }
  }

  async toggleStatusEffect(statusId, options = {}) {
    if (
      typeof statusId === "string" &&
      statusId.startsWith("hol.") &&
      CONFIG.statusEffects.some(effect => effect.id === statusId)
    ) {
      // A HUD toggle must not erase multiple independently sourced conditions.
      await new ConditionPanel(this, statusId.slice(4)).render({ force: true });
      return this.statuses.has(statusId);
    }
    return super.toggleStatusEffect(statusId, options);
  }
}
