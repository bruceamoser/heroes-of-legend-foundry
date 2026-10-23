import { ConditionPanel } from "../applications/conditions.mjs";
import { PORTABLE_FORMAT, MAX_CHARACTER_BYTES } from "../rules/portable-character.mjs";
import { portableActorSource } from "../services/portable-actor-import.mjs";
export class HOLActor extends foundry.documents.Actor {
  static async fromImport(source, context) {
    if (source?.format !== PORTABLE_FORMAT) return super.fromImport(source, context);
    return this.fromSource(await portableActorSource(source), { ...context, strict: true, dropInvalidEmbedded: false });
  }

  async importFromJSON(json) {
    const source = JSON.parse(json);
    if (source?.format === PORTABLE_FORMAT) {
      if (!this.testUserPermission(game.user, "OWNER")) throw new Error("You must own the character to import its data.");
      if (this.type !== "character" || this.isToken || this.pack)
        throw new Error("Import a workshop character into a world character Actor.");
      if (new TextEncoder().encode(json).length > MAX_CHARACTER_BYTES) throw new Error("Character file is too large.");
    }
    // V14 preserves destination identity, ownership, folder and sort, then updates
    // the actual Actor with replacement contents rather than opening a draft.
    return super.importFromJSON(json);
  }

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
