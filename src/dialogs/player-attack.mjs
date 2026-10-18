import { referencePickerOptions, readReferenceSelection, bindReferenceSearch, bindReferenceDrops } from "../services/reference-play.mjs";
import {
  situationalRollDraft,
  situationalAdjustmentLabel,
  effectiveRollDraft,
} from "../rules/situational-adjustment.mjs";
import {
  basicMeleeDialogContext,
  requestPlayerBasicMelee,
} from "../services/player-attacks.mjs";
import { prepareRoll } from "../services/roll-preparation.mjs";

const ID = "heroes-of-legend";

export class BasicMeleeDialog extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  constructor(item, combat, participantId) {
    super();
    this.item = item;
    this.combat = combat;
    this.participantId = participantId;
    this.draft = {
      weaponItemUuid: "",
      ...situationalRollDraft(),
      adjustmentOverride: false,
      referenceItemIds: [],
      perception: {},
      woundApplicability: {},
      rulingReason: "",
      override: false,
    };
    this.targetHook = (user) => {
      if (this.rendered && user.id === game.user.id) void this.render();
    };
    Hooks.on("targetToken", this.targetHook);
    this.context = null;
    this.basis = null;
    this.notice = "";
    this.woundModifierSignature = null;
    this.submitting = false;
    this.woundHookHandlers = [
      "createActiveEffect",
      "updateActiveEffect",
      "deleteActiveEffect",
    ].map((event) => [event, (effect) => this.woundEffectChanged(effect)]);
    for (const [event, handler] of this.woundHookHandlers)
      Hooks.on(event, handler);
  }

  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-roll-dialog", "hol-player-attack"],
    window: { title: "Prepare Basic Melee", resizable: true },
    position: { width: 640, height: 760 },
    actions: {
      attack: BasicMeleeDialog.attack,
    },
  };

  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/player-attack.hbs",
      scrollable: [".hol-body"],
    },
  };

  selection() {
    const { weaponItemUuid, override, ...draft } = this.draft;
    const nativeTargets = [...game.user.targets];
    const targetTokenUuid = nativeTargets.length === 1
      ? nativeTargets[0].document?.uuid ?? nativeTargets[0].uuid : null;
    return {
      weaponItemUuid,
      targetTokenUuid,
      requireNativeTarget: true,
      rulingReason: this.draft.rulingReason,
      override: this.draft.override,
      draft,
    };
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    this.context = basicMeleeDialogContext(
      this.item,
      this.combat,
      this.participantId,
      this.selection(),
    );
    if (!this.draft.weaponItemUuid)
      this.draft.weaponItemUuid = this.context.weaponItemUuid ?? "";
    const woundModifiers = this.context.basis?.woundModifiers;
    if (woundModifiers !== undefined) {
      const signature = JSON.stringify(woundModifiers);
      if (
        this.woundModifierSignature !== null &&
        signature !== this.woundModifierSignature
      ) {
        this.notice =
          "Active wound modifiers changed. Optional wound adjustments have been reset.";
        this.draft.woundApplicability = {};
        this.context.plan = null;
        this.context.planError = "";
      }
      this.woundModifierSignature = signature;
    }
    this.basis = this.context.basis;
    const fears = [
      ...new Set(
        (this.context.basis?.contributions ?? [])
          .filter((entry) => entry.key === "frightened")
          .map((entry) => entry.source),
      ),
    ];
    this.fears = fears;
    for (const source of fears) this.draft.perception[source] ??= "no";
    for (const modifier of this.basis?.woundModifiers ?? [])
      this.draft.woundApplicability[modifier.effectId] ??= "does-not-apply";
    if (this.basis) {
      try {
        this.syncAdjustment();
        this.context.plan = prepareRoll(this.basis, this.draft);
        this.context.planError = "";
      } catch (error) { this.context.planError = error.message; }
    }
    return {
      ...context,
      references: referencePickerOptions(this.item.actor, this.draft),
      weapons: this.context.weapons,
      multipleWeapons: this.context.weapons.length > 1,
      weaponName: this.context.weapons.find(weapon => weapon.uuid === this.context.weaponItemUuid)?.name ?? "No held melee weapon",
      targetTokenUuid: this.context.targetTokenUuid,
      reasons: this.context.reasons,
      actionGuidance: this.context.actionReason,
      rulingReason: this.draft.rulingReason,
      override: this.draft.override,
      gm: game.user.isGM,
      actorName: this.item.actor.name,
      actorTokenName: this.context.actorToken?.name ?? "",
      targetName:
        this.context.targets.find(
          (target) => target.uuid === this.context.targetTokenUuid,
        )?.name ?? "",
      attribute: this.context.basis?.attribute ?? this.item.actor.system.attributes.brawn.effective,
      geometryStatus: this.context.geometry?.status ?? "unavailable",
      geometryReason: this.context.geometry?.status === "adjacent" ? "" : this.context.geometry?.reason ?? "",
      notice: this.notice,
      sources: this.context.plan?.sources ?? [],
      formula:
        this.context.plan?.formula ??
        this.context.planError ??
        "Choose a token, target and held melee weapon.",
      totals: this.context.plan
        ? `${this.context.plan.boons} Boons · ${this.context.plan.banes} Banes · ${this.context.plan.canceled} canceled pairs · net extras ${this.context.plan.net} (maximum 3)`
        : "",
      fears: fears.map((source, index) => ({
        source,
        index,
        yes: this.draft.perception[source] === "yes",
        no: this.draft.perception[source] === "no",
      })),
      wounds: (this.context.basis?.woundModifiers ?? []).map(
        (modifier, index) => ({
          ...modifier,
          index,
          applies:
            this.draft.woundApplicability[modifier.effectId] === "applies",
          doesNotApply:
            this.draft.woundApplicability[modifier.effectId] ===
            "does-not-apply",
        }),
      ),
      draft: this.draft,
      adjustmentLabel: situationalAdjustmentLabel(this.draft.adjustment),
      canAttack:
        Boolean(this.context.basis) &&
        Boolean(this.context.plan) &&
        !this.context.planError &&
        this.context.reasons.length === 0 &&
        !this.submitting,
    };
  }

  woundEffectChanged(effect) {
    if (
      !this.rendered ||
      effect?.parent?.uuid !== this.item.actor.uuid ||
      effect.getFlag?.(ID, "woundModifier") === undefined
    )
      return;
    void this.render();
  }

  async _onClose(options) {
    Hooks.off("targetToken", this.targetHook);
    for (const [event, handler] of this.woundHookHandlers)
      Hooks.off(event, handler);
    this.woundHookHandlers = [];
    return super._onClose(options);
  }

  readDraft() {
    const value = (name) =>
      this.element.querySelector(`[name="${name}"]`)?.value;
    const checked = (name) =>
      this.element.querySelector(`[name="${name}"]`)?.checked === true;
    this.draft = {
      ...this.draft,
      weaponItemUuid: value("weaponItemUuid") ?? this.draft.weaponItemUuid,
      adjustment: Number(value("adjustment") ?? 0),
      referenceItemIds: readReferenceSelection(this.element),
      perception: Object.fromEntries(
        this.fears.map((source, index) => [
          source,
          checked(`fear-${index}`) ? "yes" : "no",
        ]),
      ),
      woundApplicability: Object.fromEntries(
        (this.basis?.woundModifiers ?? []).map((modifier, index) => [
          modifier.effectId,
          checked(`wound-${index}`) ? "applies" : "does-not-apply",
        ]),
      ),
      rulingReason: value("rulingReason") ?? "",
      override: this.element.querySelector('[name="override"]')?.checked === true,
    };
  }

  syncAdjustment() {
    const baseline = prepareRoll(this.basis, { ...this.draft, boons: 0, banes: 0 });
    Object.assign(this.draft, effectiveRollDraft(
      baseline, this.draft.adjustment, this.draft.adjustmentOverride,
    ));
  }
  preview() {
    const sources = this.element.querySelector(".hol-roll-sources"),
      output = this.element.querySelector("output"),
      totals = this.element.querySelector(".hol-roll-totals"),
      button = this.element.querySelector('[data-action="attack"]');
    sources?.replaceChildren();
    if (!this.context?.basis) {
      const label = situationalAdjustmentLabel(this.draft.adjustment);
      this.element.querySelector("[data-adjustment-label]").textContent = label;
      this.element.querySelector("[name=adjustment]").setAttribute("aria-valuetext", label);
      if (output) output.textContent = this.context?.reasons.join(" ") ?? "";
      if (button) button.disabled = true;
      return;
    }
    try {
      this.syncAdjustment();
      const adjustmentLabel = situationalAdjustmentLabel(this.draft.adjustment);
      this.element.querySelector("[data-adjustment-label]").textContent = adjustmentLabel;
      const slider = this.element.querySelector("[name=adjustment]");
      slider.value = this.draft.adjustment;
      slider.setAttribute("aria-valuetext", adjustmentLabel);
      const plan = prepareRoll(this.context.basis, this.draft);
      for (const source of plan.sources) {
        const li = document.createElement("li");
        li.textContent = `${source.label}: ${source.amount} ${source.kind === "boon" ? "Boon(s)" : "Bane(s)"}${source.automatic ? " · automatic" : ""}`;
        sources?.append(li);
      }
      output.textContent = plan.formula;
      totals.textContent = `${plan.boons} Boons · ${plan.banes} Banes · ${plan.canceled} canceled pairs · net extras ${plan.net} (maximum 3)`;
      button.disabled = this.context.reasons.length > 0 || this.submitting;
    } catch (error) {
      output.textContent = error.message;
      totals.textContent = "";
      button.disabled = true;
    }
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.addEventListener("input", (event) => {
      if (event.target.name === "adjustment") this.draft.adjustmentOverride = true;
      this.readDraft();
      this.preview();
    });
    this.element.addEventListener("change", async (event) => {
      if (
        !event.target.closest(
          "[name=weaponItemUuid], [name=rulingReason], [name=override], [name^=fear-]",
        )
      )
        return;
      this.readDraft();
      await this.render();
    });
    bindReferenceSearch(this.element);
    bindReferenceDrops(this.element, () => ({ actor: this.item.actor, options: {} }), async () => {
      this.readDraft();
      await this.preview();
    });
    this.preview();
  }

  static async attack() {
    if (this.submitting) return;
    this.readDraft();
    try {
      const selection = this.selection();
      if (!selection.targetTokenUuid || selection.targetTokenUuid !== this.basis?.targetTokenUuid) {
        this.notice = "Target changed. Review your Foundry target and attack again.";
        await this.render();
        return;
      }
      this.submitting = true;
      await this.render();
      selection.draft = structuredClone(this.selection().draft);
      await requestPlayerBasicMelee(
        this.item,
        this.combat,
        this.participantId,
        selection,
      );
      await this.close();
    } catch (error) {
      this.submitting = false;
      ui.notifications.error(error.message);
      if (this.rendered) await this.render();
    }
  }
}

export async function promptBasicMelee(item, combat, participantId) {
  if (!item.actor?.isOwner && !game.user.isGM)
    throw new Error(
      "Use a Basic Melee ability belonging to a character you own, or as the DA.",
    );
  return new BasicMeleeDialog(item, combat, participantId).render({
    force: true,
  });
}
