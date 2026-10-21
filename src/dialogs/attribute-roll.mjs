import { bindNetChoices } from "./net-control.mjs";
import {
  referencePickerOptions,
  readReferenceSelection,
  bindReferenceSearch,
  bindReferenceDrops,
} from "../services/reference-play.mjs";
import {
  situationalRollDraft,
  effectiveRollDraft,
} from "../rules/situational-adjustment.mjs";
import { rollPrepared } from "../services/roll.mjs";
import { rollBasis, prepareRoll } from "../services/roll-preparation.mjs";
import {
  activateOwnedAbility,
  requestDefenseAbility,
  reviewedDefenseAbilityOptions,
  removeDefenseBenefit,
} from "../services/abilities.mjs";
const ID = "heroes-of-legend";
const netLabel = (n) => n ? `${Math.abs(n)} ${n < 0 ? "Bane" : "Boon"}${Math.abs(n) === 1 ? "" : "s"}` : "Even";
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
      ...situationalRollDraft(),
      adjustmentOverride: false,
      referenceItemIds: [],
      defenseSubstitutionItemUuid: "",
      perception: {},
      woundApplicability: {},
    };
    this.notice = "";
    this.activating = false;
    this.targetHook = user => { if (user.id === game.user.id && this.rendered && this.mode === "attack") void this.render(); };
    Hooks.on("targetToken", this.targetHook);
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
    position: { width: 470, height: "auto" },
    actions: {
      grit: SharedRollDialog.grit,
      roll: SharedRollDialog.roll,
      useAbility: SharedRollDialog.useAbility,
      deathMark: SharedRollDialog.deathMark,
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
        "Active wound modifiers changed. Optional wound adjustments have been reset.";
      this.draft.woundApplicability = {};
    }
    this.basis = basis;
    if (
      this.draft.defenseSubstitutionItemUuid &&
      !basis.defenseSubstitutions?.some(
        (option) => option.itemUuid === this.draft.defenseSubstitutionItemUuid,
      )
    ) {
      this.notice =
        "The selected defense card changed. Review the ordinary defense attribute or choose another card.";
      this.draft.defenseSubstitutionItemUuid = "";
    }
    const fears = [
      ...new Set(
        this.basis.contributions
          .filter((c) => this.mode !== "death" && c.key === "frightened")
          .map((c) => c.source),
      ),
    ];
    this.fears = fears;
    for (const source of fears) this.draft.perception[source] ??= "no";
    for (const modifier of basis.woundModifiers)
      this.draft.woundApplicability[modifier.effectId] ??= "does-not-apply";
    this.syncAdjustment();
    this.abilityOptions =
      this.mode === "defense"
        ? reviewedDefenseAbilityOptions(this.actor, {
            attackMessageId: this.attackMessageId,
            defenderTokenUuid: this.defenderTokenUuid,
          }).options
        : [];
    this.pendingResponse = Boolean(this.basis.survival?.pending);
    return {
      partyPiece:
        this.basis.mode === "attribute" && this.attributeKey === "guile"
          ? this.basis.partyPiece
          : null,
      lookOverHere: this.mode === "defense" && Boolean(this.basis.incoming),
      references: this.mode === "death" ? [] : referencePickerOptions(this.actor, this.draft, {
        mode: this.mode,
        defenderTokenUuid: this.defenderTokenUuid,
      }),
      attributeEditable: this.mode === "attribute",
      attributeOptions: Object.keys(this.actor.system.attributes ?? {}).map((key) => ({
        key, name: game.i18n.localize(`HOL.Attributes.${key}`), selected: key === this.attributeKey,
      })),
      name: this.actor.name,
      failed: this.actor.getFlag(ID,"deathMarks") ?? this.actor.getFlag(ID,"survival")?.marks ?? 0,
      deathMarks: [1,2,3].map(value=>({value,filled:value <= (this.actor.getFlag(ID,"deathMarks") ?? this.actor.getFlag(ID,"survival")?.marks ?? 0)})),
      rangedWeaponOptions: this.draft.abilityConfiguration?.ranged
        ? (await import("../services/ranged-ammunition.mjs")).rangedWeaponOptions(this.actor,this.draft.rangedWeaponItemId) : [],
      death: this.mode === "death",
      gritAvailable: this.basis.survival?.gritAvailable,
      canGrit:
        this.mode === "death" &&
        this.basis.survival?.gritAvailable > 0 &&
        !this.pendingResponse,
      incoming: this.basis.incoming,
      pendingResponse: this.pendingResponse,
      attributeName: game.i18n.localize(`HOL.Attributes.${this.attributeKey}`),
      attribute: this.basis.attribute,
      defenseSubstitutions:
        this.basis.defenseSubstitutions?.map((option) => ({
          ...option,
          attributeName: game.i18n.localize(
            `HOL.Attributes.${option.attributeKey}`,
          ),
          selected: this.draft.defenseSubstitutionItemUuid === option.itemUuid,
        })) ?? [],
      defense: this.mode === "defense",
      notice: this.notice,
      targetNotice: this.mode === "attack" && this.basis.targetTokenUuid ? `Target: ${fromUuidSync(this.basis.targetTokenUuid)?.name ?? "selected target"}` : "",
      draft: this.draft,
      adjustmentLabel: netLabel(this.draft.adjustment),
      abilities: this.abilityOptions.map((option) => ({
        ...option,
        reasonText: [...option.reasons, ...(option.warnings ?? [])].join(" "),
      })),
      fears: fears.map((source, index) => ({
        source,
        index,
        yes: this.draft.perception[source] === "yes",
        no: this.draft.perception[source] === "no",
      })),
      wounds: this.mode === "death" ? [] : this.basis.woundModifiers.map((modifier, index) => ({
        ...modifier,
        index,
        applies: this.draft.woundApplicability[modifier.effectId] === "applies",
        doesNotApply:
          this.draft.woundApplicability[modifier.effectId] === "does-not-apply",
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
      adjustment: Number(value("adjustment") ?? 0),
      partyPiece: checked("partyPiece"),
      lookOverHere: checked("lookOverHere"),
      referenceItemIds: readReferenceSelection(this.element),
      rangedWeaponItemId: value("rangedWeaponItemId") ?? this.draft.rangedWeaponItemId,
      defenseSubstitutionItemUuid: value("defenseSubstitutionItemUuid") ?? "",
      perception: Object.fromEntries(
        this.fears.map((source, index) => [
          source,
          checked(`fear-${index}`) ? "yes" : "no",
        ]),
      ),
      woundApplicability: Object.fromEntries(
        this.basis.woundModifiers.map((modifier, index) => [
          modifier.effectId,
          checked(`wound-${index}`) ? "applies" : "does-not-apply",
        ]),
      ),
    };
  }
  refreshDefenseAbilities() {
    if (this.mode !== "defense") return;
    const options = reviewedDefenseAbilityOptions(this.actor, {
      attackMessageId: this.attackMessageId,
      defenderTokenUuid: this.defenderTokenUuid,
    }).options;
    this.abilityOptions = options;
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
      button.textContent = `${option.active ? "Remove " : option.available ? "Use " : ""}${option.name}`;
      row.querySelector(".hol-ability-reason").textContent = [
        ...option.reasons,
        ...(option.warnings ?? []),
      ].join(" ");
      list.append(row);
    }
  }
  syncAdjustment() {
    const baseline = prepareRoll(this.basis, {
      ...this.draft,
      boons: 0,
      banes: 0,
    });
    Object.assign(
      this.draft,
      effectiveRollDraft(
        baseline,
        this.draft.adjustment,
        this.draft.adjustmentOverride,
      ),
    );
  }
  preview() {
    const list = this.element.querySelector(".hol-roll-sources"),
      output = this.element.querySelector("[data-roll-error]"),
      detail = this.element.querySelector(".hol-roll-totals"),
      button = this.element.querySelector('[data-action="roll"]');
    list.replaceChildren();
    try {
      this.refreshDefenseAbilities();
      this.syncAdjustment();
      const adjustmentLabel = netLabel(this.draft.adjustment);
      this.element.querySelector("[data-adjustment-label]").textContent =
        adjustmentLabel;
      const slider = this.element.querySelector("[name=adjustment]");
      slider.value = this.draft.adjustment;
      slider.setAttribute("aria-valuetext", adjustmentLabel);
      const plan = prepareRoll(this.basis, this.draft);
      const chosen = this.basis.defenseSubstitutions?.find(
        (option) => option.itemUuid === plan.defenseSubstitutionItemUuid,
      );
      const selector = this.element.querySelector('[name="attributeKey"]');
      if (selector) selector.value = plan.resolvedAttributeKey;
      const stat = this.element.querySelector("[data-roll-attribute]");
      if (stat)
        stat.textContent = `${game.i18n.localize(`HOL.Attributes.${plan.resolvedAttributeKey}`)}: ${chosen?.attribute ?? this.basis.attribute}`;
      for (const source of plan.sources) {
        const li = document.createElement("li");
        li.textContent = `${source.label}: ${source.amount} ${source.kind === "boon" ? "Boon(s)" : "Bane(s)"}${source.automatic ? " · automatic" : ""}`;
        list.append(li);
      }
      output.textContent = "";
      this.element.querySelector("[data-roll-count]").textContent = plan.count;
      this.element.querySelector("[data-roll-keep]").textContent = plan.net ? `Keep ${plan.net > 0 ? "highest" : "lowest"} three` : "Keep all three";
      this.element.querySelector("[data-roll-formula]").textContent = plan.formula;
      const value = this.element.querySelector("[data-roll-value]");
      value.textContent = `${plan.attribute >= 0 ? "+" : ""}${plan.attribute}`;
      const dice = this.element.querySelector("[data-roll-dice]");
      dice.innerHTML = Array.from({ length: plan.count }, (_, i) => `<span class="${i >= 3 ? "extra-die" : ""}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="3"/><circle cx="7" cy="7" r="1.4"/><circle cx="17" cy="17" r="1.4"/><circle cx="12" cy="12" r="1.4"/></svg></span>`).join("");
      const net = this.element.querySelector("[data-net-control]");
      const n = this.draft.adjustment;
      net.dataset.polarity = n < 0 ? "bane" : n > 0 ? "boon" : "even";
      net.style.setProperty("--net-start", `${Math.min(50, ((n + 3) / 6) * 100)}%`);
      net.style.setProperty("--net-size", `${Math.abs(n) / 6 * 100}%`);
      detail.textContent = `${plan.boons} Boons · ${plan.banes} Banes · ${plan.canceled} canceled pairs · net extras ${plan.net} (maximum 3)`;
      button.disabled = this.activating || this.pendingResponse;
    } catch (e) {
      output.textContent = e.message;
      detail.textContent = "";
      button.disabled = true;
    }
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element
      .querySelector(".hol-body")
      .addEventListener("input", (event) => {
        if (event.target.name === "adjustment")
          this.draft.adjustmentOverride = true;
        if (event.target.name === "attributeKey" && this.mode === "attribute") {
          this.readDraft();
          this.attributeKey = event.target.value;
          void this.render();
          return;
        }
        this.readDraft();
        this.preview();
      });
    bindNetChoices(this.element);
    const choices = this.element.querySelector(".hol-net-choices");
    this.element.querySelector("[data-net-control]").append(choices);
    bindReferenceSearch(this.element);
    bindReferenceDrops(
      this.element,
      () => ({
        actor: this.actor,
        options: { mode: this.mode, defenderTokenUuid: this.defenderTokenUuid },
      }),
      async () => {
        this.readDraft();
        await this.preview();
      },
    );
    this.preview();
  }
  static async deathMark(event,target) {
    try {
      if (!this.actor.testUserPermission(game.user,"OWNER")) throw new Error("Only the character owner can change death marks.");
      const selected=Number(target.dataset.marks), previous=this.actor.getFlag(ID,"deathMarks") ?? this.actor.getFlag(ID,"survival")?.marks ?? 0;
      const marks=selected === previous ? Math.max(0,selected-1) : selected;
      const {updateOwnedDocument}=await import("../services/documents.mjs");
      await updateOwnedDocument(this.actor,{[`flags.${ID}.deathMarks`]:marks});
      await this.render();
    } catch(error) {ui.notifications.error(error.message);}
  }
  static async grit() {
    try {
      const {requestRecovery} = await import("../services/recovery.mjs");
      const {damageBasis} = await import("../services/damage.mjs");
      await requestRecovery(this.actor, damageBasis(this.actor), {kind:"grit"});
      await this.close();
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static async roll() {
    if (this.rolling) return;
    this.readDraft();
    try {
      if (this.activating)
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
      const message = await rollPrepared(this.actor, this.basis, this.draft);
      await this.close();
      const {showAbilityOutcome}=await import("../services/roll.mjs");
      showAbilityOutcome(message);
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
      if (
        status &&
        ["complete", "interrupted", "failed"].includes(status.status)
      )
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
      if (this.abilityOptions.find(option => option.itemId === item.id)?.active) {
        await removeDefenseBenefit(item);
        this.notice = `${item.name} removed.`;
        return;
      }
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
          })
        : await activateOwnedAbility(item);
      this.notice = `${item.name} applied.`;
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
