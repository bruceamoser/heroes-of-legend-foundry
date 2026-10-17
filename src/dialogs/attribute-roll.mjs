import { rollPrepared } from "../services/roll.mjs";
import { rollBasis, prepareRoll } from "../services/roll-preparation.mjs";
export class SharedRollDialog extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  constructor(
    actor,
    attributeKey,
    {
      mode = "attribute",
      attackMessageId = null,
      defenderTokenUuid = null,
    } = {},
  ) {
    super();
    this.actor = actor;
    this.attributeKey = attributeKey;
    this.mode = mode;
    this.attackMessageId = attackMessageId;
    this.defenderTokenUuid = defenderTokenUuid;
    this.draft = {
      boons: 0,
      banes: 0,
      boonsLabel: "Situational Boons",
      banesLabel: "Situational Banes",
      perception: {},
      additionalAttempt: false,
      attemptReason: "",
    };
    this.notice = "";
  }
  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-roll-dialog"],
    window: { title: "Prepare roll", resizable: true },
    position: { width: 560, height: 650 },
    actions: {
      grit: SharedRollDialog.grit,
      roll: SharedRollDialog.roll,
      changeDefender: SharedRollDialog.changeDefender,
    },
  };
  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/attribute-roll.hbs",
      scrollable: [".hol-body"],
    },
  };
  async _prepareContext() {
    this.basis = rollBasis(
      this.actor,
      this.attributeKey,
      this.mode,
      this.attackMessageId,
      this.defenderTokenUuid,
    );
    const fears = [
      ...new Set(
        this.basis.contributions
          .filter((c) => this.mode !== "death" && c.key === "frightened")
          .map((c) => c.source),
      ),
    ];
    this.fears = fears;
    const prior =
      game.messages
        .get(this.attackMessageId)
        ?.getFlag("heroes-of-legend", "defenseResponses")
        ?.filter((r) => r.actorUuid === this.actor.uuid) ?? [];
    this.priorCount = prior.length;
    this.pendingResponse =
      prior.some((r) => r.status === "rolling") ||
      Boolean(this.basis.survival?.pending);
    return {
      name: this.actor.name,
      death: this.mode === "death",
      gritAvailable: this.basis.survival?.gritAvailable,
      canGrit:
        this.mode === "death" &&
        this.basis.survival?.gritAvailable > 0 &&
        !this.pendingResponse,
      incoming: this.basis.incoming,
      priorCount: this.priorCount,
      pendingResponse: this.pendingResponse,
      attributeName: game.i18n.localize(`HOL.Attributes.${this.attributeKey}`),
      attribute: this.basis.attribute,
      defense: this.mode === "defense",
      notice: this.notice,
      draft: this.draft,
      fears: fears.map((source, index) => ({
        source,
        index,
        yes: this.draft.perception[source] === "yes",
        no: this.draft.perception[source] === "no",
      })),
    };
  }
  readDraft() {
    const value = (name) =>
      this.element.querySelector(`[name="${name}"]`)?.value;
    this.draft = {
      boons: value("boons"),
      banes: value("banes"),
      boonsLabel: value("boonsLabel"),
      banesLabel: value("banesLabel"),
      additionalAttempt:
        this.element.querySelector("[name=additionalAttempt]")?.checked ===
        true,
      attemptReason: value("attemptReason") ?? "",
      perception: Object.fromEntries(
        this.fears.map((source, index) => [source, value(`fear-${index}`)]),
      ),
    };
  }
  preview() {
    const list = this.element.querySelector(".hol-roll-sources"),
      output = this.element.querySelector("output"),
      detail = this.element.querySelector(".hol-roll-totals"),
      button = this.element.querySelector('[data-action="roll"]');
    list.replaceChildren();
    try {
      const plan = prepareRoll(this.basis, this.draft);
      for (const source of plan.sources) {
        const li = document.createElement("li");
        li.textContent = `${source.label}: ${source.amount} ${source.kind === "boon" ? "Boon(s)" : "Bane(s)"}${source.automatic ? " · automatic" : ""}`;
        list.append(li);
      }
      output.textContent = plan.formula;
      detail.textContent = `${plan.boons} Boons · ${plan.banes} Banes · ${plan.canceled} canceled pairs · net extras ${plan.net} (maximum 3)`;
      button.disabled =
        this.pendingResponse ||
        (this.priorCount > 0 &&
          (!this.draft.additionalAttempt || !this.draft.attemptReason?.trim()));
    } catch (e) {
      output.textContent = e.message;
      detail.textContent = "";
      button.disabled = true;
    }
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelector(".hol-body").addEventListener("input", () => {
      this.readDraft();
      this.preview();
    });
    this.preview();
  }
  static async changeDefender() {
    try {
      const { chooseDefender } = await import("./defender-choice.mjs");
      await this.close();
      await chooseDefender(this.attackMessageId, { forceChoice: true });
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static async grit() {
    try {
      const { requestSurvival } = await import("../services/survival.mjs");
      await requestSurvival(this.actor, this.basis, this.draft, "grit");
      await this.close();
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static async roll() {
    if (this.rolling) return;
    this.readDraft();
    try {
      const current = rollBasis(
        this.actor,
        this.attributeKey,
        this.mode,
        this.attackMessageId,
        this.defenderTokenUuid,
      );
      if (JSON.stringify(current) !== JSON.stringify(this.basis)) {
        this.notice =
          "This character's roll sources changed. Review the updated values and roll again.";
        await this.render();
        return;
      }
      this.rolling = true;
      this.element.querySelector('[data-action="roll"]').disabled = true;
      await rollPrepared(this.actor, this.basis, this.draft);
      await this.close();
    } catch (e) {
      ui.notifications.error(e.message);
    } finally {
      this.rolling = false;
      if (this.rendered) this.preview();
    }
  }
}
export async function promptAttributeRoll(actor, attributeKey) {
  if (!actor.isOwner) return;
  return new SharedRollDialog(actor, attributeKey).render({ force: true });
}
export async function promptDefenseRoll(actor, attributeKey, options = {}) {
  return new SharedRollDialog(actor, attributeKey, {
    ...options,
    mode: "defense",
  }).render({
    force: true,
  });
}
