import { requestConditionApply } from "../services/condition-apply.mjs";
import {
  actorContributions,
  requestCondition,
} from "../services/conditions.mjs";
import { CONDITION_KINDS, conditionSummary } from "../rules/conditions.mjs";
export class ConditionPanel extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  constructor(actor, key = "burning") {
    super();
    this.actor = actor;
    this.key = key;
    this.draft = { rating: 1, source: "DA ruling", persistence: "temporary" };
    this.hook = Hooks.on("updateActor", (a) => {
      if (a.uuid === actor.uuid && this.rendered) this.render();
    });
    this.effectHook = Hooks.on("updateActiveEffect", (e) => {
      if (e.parent?.uuid === actor.uuid && this.rendered) this.render();
    });
  }
  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-conditions"],
    window: { title: "Condition sources", resizable: true },
    position: { width: 700, height: 650 },
    actions: {
      add: ConditionPanel.add,
      applyTick: ConditionPanel.applyTick,
      remove: ConditionPanel.remove,
      reduce: ConditionPanel.reduce,
    },
  };
  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/conditions.hbs",
      scrollable: [""],
    },
  };
  async _prepareContext() {
    if (!this.actor.testUserPermission(game.user, "OBSERVER"))
      throw new Error("You cannot inspect this actor.");
    const contributions = actorContributions(this.actor),
      summary = conditionSummary(contributions);
    const kind = CONDITION_KINDS[this.key],
      persistence =
        kind === "binary"
          ? ["binary"]
          : kind === "maintained"
            ? ["maintained"]
            : ["temporary", "starred"];
    return {
      name: this.actor.name,
      gm: game.user.isGM,
      owner: this.actor.isOwner,
      key: this.key,
      binary: kind === "binary",
      keys: Object.keys(CONDITION_KINDS).map((key) => ({
        key,
        selected: key === this.key,
      })),
      draft: this.draft,
      persistence: persistence.map((value) => ({
        value,
        selected:
          value ===
          (persistence.includes(this.draft.persistence)
            ? this.draft.persistence
            : persistence[0]),
      })),
      summary: Object.values(summary).filter((s) => s.active).map(s => ({ ...s, canApply: this.actor.isOwner && ["burning", "freezing", "bleeding"].includes(s.key) })),
      contributions: contributions.map((c) => ({
        ...c,
        temporary: c.persistence === "temporary",
      })),
    };
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.addEventListener("input", () => {
      const value = (name) =>
        this.element.querySelector(`[name=${name}]`)?.value;
      this.draft = {
        rating: Number(value("rating") ?? 1),
        source: value("source") ?? "DA ruling",
        persistence: value("persistence") ?? "temporary",
      };
    });
    this.element
      .querySelector("[name=key]")
      ?.addEventListener("change", (event) => {
        this.key = event.target.value;
        if (CONDITION_KINDS[this.key] === "binary") this.draft.rating = 1;
        this.render();
      });
  }
  async _onClose(options) {
    Hooks.off("updateActor", this.hook);
    Hooks.off("updateActiveEffect", this.effectHook);
    return super._onClose(options);
  }
  static async applyTick(event, target) {
    target.disabled = true;
    try { await requestConditionApply(this.actor, target.dataset.key); }
    catch (e) { ui.notifications.error(e.message); }
    finally { if (target.isConnected) target.disabled = false; }
  }
  static async add() {
    try {
      const value = (name) =>
        this.element.querySelector(`[name=${name}]`).value;
      await requestCondition(this.actor, "add", {
        key: this.key,
        rating: Number(value("rating")),
        persistence: value("persistence"),
        source: value("source"),
      });
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static async remove(event, target) {
    try {
      await requestCondition(this.actor, "remove", {
        effectId: target.dataset.id,
      });
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static async reduce(event, target) {
    try {
      await requestCondition(this.actor, "reduce", {
        effectId: target.dataset.id,
        amount: 1,
      });
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
}
