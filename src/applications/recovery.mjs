import { survivalState } from "../rules/survival.mjs";
import { localizeRuleLinks } from "../services/journals.mjs";
import { woundTreatmentBasis, requestWoundTreatment } from "../services/wound-treatment.mjs";
import { WoundPanel } from "./wounds.mjs";
import { requestSurvival } from "../services/survival.mjs";
import { damageBasis } from "../services/damage.mjs";
import { recoveryPreview, requestRecovery } from "../services/recovery.mjs";
export class RecoveryPanel extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  constructor(actor) {
    super();
    this.actor = actor;
    this.operation = "";
    this.effectHooks=["createActiveEffect","updateActiveEffect","deleteActiveEffect"].map(name=>[name,Hooks.on(name,effect=>{if(effect.parent?.uuid===actor.uuid&&this.rendered)void this.render();})]);
    this.actorHook=Hooks.on("updateActor",changed=>{if(changed.uuid===actor.uuid&&this.rendered)void this.render();});
  }
  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-recovery"],
    window: { title: "Health and recovery", resizable: true },
    position: { width: 780, height: "auto" },
    actions: {
      apply: RecoveryPanel.apply,
      operation: RecoveryPanel.operation,
      quick: RecoveryPanel.quick,
      treatment: RecoveryPanel.treatment,
      treat: RecoveryPanel.treat,
      previewDying: RecoveryPanel.previewDying,
      wounds: RecoveryPanel.wounds,
      recoverDeath: RecoveryPanel.recoverDeath,
    },
  };
  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/recovery.hbs",
      scrollable: [".hol-tool-content"],
    },
  };
  async _prepareContext() {
    if (!this.actor.testUserPermission(game.user, "OWNER"))
      throw new Error("Only this actor’s owner can record recovery.");
    const actualBasis = damageBasis(this.actor);
    this.basis = this.previewState ? {...actualBasis,hp:this.previewState.hp,survival:this.previewState,gritAvailable:this.previewState.gritAvailable} : actualBasis;
    return {
      name: this.actor.name,
      operation:this.operation,
      healing:this.operation === "heal", correction:this.operation === "correct", grit:this.operation === "grit",
      notice:this.notice,previewDying:Boolean(this.previewState),
      records:Object.values(this.actor.getFlag("heroes-of-legend","wounds")??{}).map(wound=>({...wound,
        progress:Math.min(wound.recoveryProgress??0,wound.recoveryValue??0),
        canTreat:Boolean(wound.recoveryValue&&(wound.recoveryProgress??0)<wound.recoveryValue),
        treating:wound.eventId===this.treating,
        effectText:this.actor.effects.filter(effect=>effect.active&&!effect.getFlag("heroes-of-legend","retired")&&effect.getFlag("heroes-of-legend","woundEvent")===wound.eventId).map(effect=>effect.name).join(" · ")||"—",
      })),
      gm: game.user.isGM,
      owner: this.actor.isOwner,
      pendingDeath: Boolean(
        this.actor.getFlag("heroes-of-legend", "pendingDeath"),
      ),
      basis: this.basis,
      character: this.actor.type === "character",
      automaticLifeResistance: Math.min(
        3,
        Math.max(
          0,
          ...(this.basis.passiveDefenses?.resistances ?? [])
            .filter((source) => source.type === "life")
            .map((source) => source.value),
        ),
      ),
      wounds: this.basis.survival?.wounds ?? 0,
      marks: this.basis.survival?.marks ?? 0,
      statuses: ["active", "dying", "stable", "lastWords", "dead"].map(
        (value) => ({
          value,
          selected:
            value ===
            (this.basis.survival?.status ??
              (this.basis.hp > 0 ? "active" : "dying")),
        }),
      ),
    };
  }
  draft() {
    const value = (name) => this.element.querySelector(`[name=${name}]`)?.value;
    const draft={kind:value("kind"),reason:value("reason")??""};
    for(const name of ["amount","lifeResistance","hp","wounds","marks"])if(value(name)!==undefined)draft[name]=String(value(name)).trim()===""?NaN:Number(value(name));
    if(value("status")!==undefined)draft.status=value("status");
    return draft;
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    const root=this.element;if(!root)return;
    const preview = () => {
      const draft = this.draft();
      const output = root.querySelector("[data-preview]");
      if (!output) return;
      try {
        const plan = recoveryPreview(this.actor, this.basis, draft);
        output.textContent = `HP ${this.basis.hp} → ${plan.after}${plan.state ? ` · ${plan.state.status}` : ""}`;
      } catch (e) {
        output.textContent = e.message;
      }
    };
    this.renderEvents?.abort();this.renderEvents=new AbortController();
    root.addEventListener("input", preview,{signal:this.renderEvents.signal});
    root.addEventListener("change", preview,{signal:this.renderEvents.signal});
    preview();
    await localizeRuleLinks(root);
  }
  async _onClose(options){for(const [name,id]of this.effectHooks)Hooks.off(name,id);this.renderEvents?.abort();Hooks.off("updateActor",this.actorHook);return super._onClose(options);}
  static async operation(event,target){this.operation=target.dataset.kind;if(this.operation==="correct")this.previewState=null;await this.render();}
  static async previewDying(){
    if(this.previewState)this.previewState=null;
    else{const basis=damageBasis(this.actor);this.previewState=survivalState({hp:0,maxHp:basis.maxHp,marks:1,wounds:basis.survival?.wounds??0,gritAvailable:basis.gritAvailable});}
    this.notice=this.previewState?"Dying example · 0 HP, one death mark. These controls now change only this preview.":"Preview closed; showing the recorded character.";await this.render();
  }
  static async quick(event,target){
    try{if(!this.previewState)this.basis=damageBasis(this.actor);const draft={kind:target.dataset.kind,reason:""};const plan=recoveryPreview(this.actor,this.basis,draft);if(this.previewState){this.previewState=plan.state;this.notice=`Preview · HP ${plan.after} · ${plan.state.status}. The recorded character is unchanged.`;await this.render();return;}await requestRecovery(this.actor,this.basis,draft);this.notice="Recovery requested; the recorded result will update these vitals.";await this.render();}catch(error){ui.notifications.error(error.message);}
  }
  static async treatment(event,target){this.treating=target.dataset.eventId;await this.render();}
  static async treat(event,target){
    target.disabled=true;
    try{await requestWoundTreatment(this.actor,target.dataset.eventId,Number(target.dataset.steps),woundTreatmentBasis(this.actor,target.dataset.eventId));this.treating=null;this.notice="Treatment progress requested; the scar remains.";await this.render();}catch(error){ui.notifications.error(error.message);}finally{if(target.isConnected)target.disabled=false;}
  }
  static async wounds() { await new WoundPanel(this.actor).render({ force: true }); }
  static async recoverDeath() {
    try {
      const retained = this.element
          .querySelector("[name=deathFaces]")
          .value.split(",")
          .map((s) => Number(s.trim())),
        reason = this.element.querySelector("[name=deathReason]").value;
      await requestSurvival(this.actor, null, { retained, reason }, "recover");
      await this.close();
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static async apply() {
    try {
      const draft = this.draft();
      const plan=recoveryPreview(this.actor, this.basis, draft);
      if(this.previewState){this.previewState=plan.state;this.notice=`Preview · HP ${plan.after} · ${plan.state.status}. The recorded character is unchanged.`;this.operation="";await this.render();return;}
      await requestRecovery(this.actor, this.basis, draft);
      this.notice="Recovery requested; the recorded result will update these vitals.";
      this.operation="";
      await this.render();
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
}
