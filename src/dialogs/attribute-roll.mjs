import { rollPrepared } from "../services/roll.mjs";
import { rollBasis, prepareRoll } from "../services/roll-preparation.mjs";
import {
  activateOwnedAbility,
  requestDefenseAbility,
  reviewedDefenseAbilityOptions,
} from "../services/abilities.mjs";
const ID = "heroes-of-legend";
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
      woundApplicability: {},
      additionalAttempt: false,
      attemptReason: "",
    };
    this.notice = "";
    this.activating = false;
    this.woundHookHandlers = [
      "createActiveEffect",
      "updateActiveEffect",
      "deleteActiveEffect",
    ].map((event) => [event, (effect) => this.woundEffectChanged(effect)]);
    for (const [event, handler] of this.woundHookHandlers)
      Hooks.on(event, handler);
  }
  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-roll-dialog"],
    window: { title: "Prepare roll", resizable: true },
    position: { width: 560, height: 650 },
    actions: {
      grit: SharedRollDialog.grit,
      roll: SharedRollDialog.roll,
      changeDefender: SharedRollDialog.changeDefender,
      useAbility: SharedRollDialog.useAbility,
    },
  };
  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/attribute-roll.hbs",
      scrollable: [".hol-body"],
    },
  };
  async _prepareContext() {
    const basis = rollBasis(
      this.actor,
      this.attributeKey,
      this.mode,
      this.attackMessageId,
      this.defenderTokenUuid,
    );
    if (
      this.basis &&
      JSON.stringify(this.basis.woundModifiers) !==
        JSON.stringify(basis.woundModifiers)
    ) {
      this.notice =
        "Active wound modifiers changed. Review the current injury sources and choose applicability again.";
      this.draft.woundApplicability = {};
    }
    this.basis = basis;
    const fears = [
      ...new Set(
        this.basis.contributions
          .filter((c) => this.mode !== "death" && c.key === "frightened")
          .map((c) => c.source),
      ),
    ];
    this.fears = fears;
    this.abilityOptions =
      this.mode === "defense"
        ? reviewedDefenseAbilityOptions(this.actor, {
            attackMessageId: this.attackMessageId,
            defenderTokenUuid: this.defenderTokenUuid,
            additionalAttempt: this.draft.additionalAttempt,
            attemptReason: this.draft.attemptReason,
          }).options
        : [];
    this.abilityPending = this.abilityOptions.some((option) => option.pending);
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
      abilities: this.abilityOptions.map((option) => ({
        ...option,
        reasonText: option.reasons.join(" "),
      })),
      fears: fears.map((source, index) => ({
        source,
        index,
        yes: this.draft.perception[source] === "yes",
        no: this.draft.perception[source] === "no",
      })),
      wounds: this.basis.woundModifiers.map((modifier, index) => ({
        ...modifier,
        index,
        applies: this.draft.woundApplicability[modifier.effectId] === "applies",
        doesNotApply:
          this.draft.woundApplicability[modifier.effectId] ===
          "does-not-apply",
      })),
    };
  }
  woundEffectChanged(effect) {
    if (
      !this.rendered ||
      effect?.parent?.uuid !== this.actor.uuid ||
      effect.getFlag?.(ID, "woundModifier") === undefined
    )
      return;
    void this.render();
  }
  async _onClose(options) {
    for (const [event, handler] of this.woundHookHandlers)
      Hooks.off(event, handler);
    this.woundHookHandlers = [];
    return super._onClose(options);
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
      woundApplicability: Object.fromEntries(
        this.basis.woundModifiers.map((modifier, index) => [
          modifier.effectId,
          value(`wound-${index}`),
        ]),
      ),
    };
  }
  refreshDefenseAbilities() {
    if (this.mode !== "defense") return;
    const options = reviewedDefenseAbilityOptions(this.actor, {
      attackMessageId: this.attackMessageId,
      defenderTokenUuid: this.defenderTokenUuid,
      additionalAttempt: this.draft.additionalAttempt,
      attemptReason: this.draft.attemptReason,
    }).options;
    this.abilityOptions = options;
    this.abilityPending = options.some((option) => option.pending);
    const list = this.element.querySelector(".hol-defense-abilities");
    if (!list) return;
    const rows = new Map(
      Array.from(list.children, (row) => [row.dataset.itemId, row]),
    );
    for (const option of options) {
      const row = rows.get(option.itemId);
      if (!row) continue;
      row.classList.toggle("hol-unavailable", !option.available);
      const button = row.querySelector('[data-action="useAbility"]');
      button.disabled = this.activating || !option.available;
      button.textContent = `${option.available ? "Use " : ""}${option.name}`;
      row.querySelector(".hol-ability-reason").textContent =
        option.reasons.join(" ");
      list.append(row);
    }
  }
  preview() {
    const list = this.element.querySelector(".hol-roll-sources"),
      output = this.element.querySelector("output"),
      detail = this.element.querySelector(".hol-roll-totals"),
      button = this.element.querySelector('[data-action="roll"]');
    list.replaceChildren();
    try {
      this.refreshDefenseAbilities();
      const plan = prepareRoll(this.basis, this.draft);
      for (const source of plan.sources) {
        const li = document.createElement("li");
        li.textContent = `${source.label}: ${source.amount} ${source.kind === "boon" ? "Boon(s)" : "Bane(s)"}${source.automatic ? " · automatic" : ""}`;
        list.append(li);
      }
      output.textContent = plan.formula;
      detail.textContent = `${plan.boons} Boons · ${plan.banes} Banes · ${plan.canceled} canceled pairs · net extras ${plan.net} (maximum 3)`;
      button.disabled =
        this.activating ||
        this.abilityPending ||
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
      if (this.activating || this.abilityPending)
        throw new Error(
          "The defender's ability activation is still pending. Review it before rolling.",
        );
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
  async waitForAbility(messageId) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const status = game.messages
        .get(messageId)
        ?.getFlag("heroes-of-legend", "abilityStatus");
      if (status && ["complete", "interrupted", "failed"].includes(status.status))
        return status;
      const settlement = game.combats.contents
        .map(
          (combat) =>
            combat.getFlag("heroes-of-legend", "operationReceipts")?.[
              messageId
            ],
        )
        .find((receipt) => receipt?.applied);
      if (settlement && ["complete", "interrupted"].includes(settlement.status))
        return settlement;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(
      "Ability settlement is still pending. The DA can resume it from Manage automation without rolling.",
    );
  }
  static async useAbility(event, target) {
    if (this.activating) return;
    this.readDraft();
    const item = this.actor.items.get(target.dataset.itemId);
    try {
      if (!item) throw new Error("The reviewed ability is unavailable.");
      this.activating = true;
      this.notice = `Activating ${item.name}…`;
      await this.render();
      const message = this.attackMessageId
        ? await requestDefenseAbility(item, {
            attackMessageId: this.attackMessageId,
            defenderTokenUuid: this.defenderTokenUuid,
            shieldItemUuid:
              this.abilityOptions.find((option) => option.itemId === item.id)
                ?.shieldItemUuid ?? null,
            additionalAttempt: this.draft.additionalAttempt,
            attemptReason: this.draft.attemptReason,
          })
        : await activateOwnedAbility(item);
      const status = await this.waitForAbility(message.id);
      if (status.status === "failed") throw new Error(status.error);
      this.notice =
        status.status === "complete"
          ? `${item.name} activated. Roll sources refreshed.`
          : `${item.name} could not continue; its declared cost remains spent.`;
    } catch (e) {
      this.notice = e.message;
      ui.notifications.error(e.message);
    } finally {
      this.activating = false;
      await this.render();
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
