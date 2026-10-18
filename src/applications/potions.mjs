import {
  isHealingPotionItem,
  isPotionAbility,
  potionCombatContext,
  previewPotionAdjacency,
  previewPotionUse,
  requestPotionUse,
} from "../services/potions.mjs";
import { selectPotionRecipient } from "../rules/potion-targets.mjs";

async function safePreview(options) {
  try {
    return await previewPotionUse(options);
  } catch (error) {
    return { error: error.message, canDeclare: false };
  }
}

async function geometryPreview(
  preview,
  giverParticipantId,
  recipientParticipantId,
) {
  if (preview?.outsideCombat) return preview.geometry ?? { known: false, adjacent: null, reason: "Range unavailable; use the intended recipient." };
  if (!preview?.combatUuid || preview.error)
    return { known: false, adjacent: false, distance: null };
  try {
    return await previewPotionAdjacency(
      preview.combatUuid,
      giverParticipantId,
      recipientParticipantId,
      preview.relation,
    );
  } catch (error) {
    return {
      known: false,
      adjacent: false,
      distance: null,
      error: error.message,
    };
  }
}

export class PotionPreparation extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  constructor(sourceItem, { bottleItemUuid = null } = {}) {
    super();
    this.sourceItem = sourceItem;
    this.bottleItemUuid = bottleItemUuid;
    this.previewRevision = 0;
    this.targetHook = Hooks.on("targetToken", (user) => {
      if (user.id === game.user.id && this.rendered) void this.refreshPreview();
    });
  }

  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-potion-preparation"],
    window: { title: "Healing potion", resizable: true },
    position: { width: 560, height: 560 },
    actions: { submit: PotionPreparation.submit },
  };

  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/potion-preparation.hbs",
      scrollable: [""],
    },
  };

  async _prepareContext(options) {
    if (
      !isPotionAbility(this.sourceItem) &&
      !isHealingPotionItem(this.sourceItem)
    )
      throw new Error("Choose the reviewed healing potion action or bottle.");
    if (!this.sourceItem.actor?.isOwner && !game.user.isGM)
      throw new Error("Only the potion giver's owner or the DA can prepare it.");
    const { combat, combatant } = potionCombatContext(this.sourceItem),
      bottles =
        this.sourceItem.type === "equipment"
          ? [this.sourceItem]
          : this.sourceItem.actor.items
              .filter(isHealingPotionItem)
              .sort((a, b) => a.name.localeCompare(b.name)),
      selectedBottle =
        bottles.find((item) => item.uuid === this.bottleItemUuid) ??
        bottles[0] ??
        null;
    this.bottleItemUuid = selectedBottle?.uuid ?? null;
    this.combat = combat;
    this.combatUuid = combat?.uuid ?? null;
    this.giverParticipantId = combatant?.id ?? this.sourceItem.actor.uuid;
    const selection = this.recipientSelection(),
      preview = selection.error
        ? { error: selection.error, canDeclare: false }
        : selectedBottle
          ? await safePreview({
              sourceItemUuid: this.sourceItem.uuid,
              bottleItemUuid: selectedBottle.uuid,
              combatUuid: combat?.uuid ?? null,
              giverParticipantId: combatant?.id ?? null,
              recipientParticipantId: selection.participantId,
              recipientTokenUuid: selection.tokenUuid ?? null,
              continuesAfterInterruption: true,
            })
          : { error: "This character has no healing bottle.", canDeclare: false };
    return {
      ...(await super._prepareContext(options)),
      sourceName: this.sourceItem.name,
      giverName: this.sourceItem.actor.name,
      gm: game.user.isGM,
      bottles: bottles.map((item) => ({
        uuid: item.uuid,
        name: item.name,
        supply:
          item.system.inventoryDie > 0
            ? `supply d${item.system.inventoryDie}`
            : "supply out",
      })),
      bottlesAvailable: bottles.length > 0,
      sourceIsBottle: bottles.length <= 1,
      selectedBottleName: selectedBottle?.name ?? "",
      selectedBottleUuid: selectedBottle?.uuid ?? "",
      recipientName: selection.name,
      preview,
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    for (const selector of [
      "[name=bottleUuid]",
      "[name=interruption]",
      "[name=willing]",
      "[name=geometryOverride]",
      "[name=daWillingness]",
    ])
      this.element
        .querySelector(selector)
        ?.addEventListener("change", () => void this.refreshPreview());
    for (const selector of [
      "[name=geometryReason]",
      "[name=daWillingnessReason]",
    ])
      this.element
        .querySelector(selector)
        ?.addEventListener("input", () => void this.refreshPreview());
    await this.refreshPreview();
  }

  async _onClose(options) {
    Hooks.off("targetToken", this.targetHook);
    this.previewRevision++;
    return super._onClose(options);
  }

  recipientSelection() {
    if (!this.combat) {
      const actor = this.sourceItem.actor;
      return selectPotionRecipient({
        giver: { id: actor.uuid, actorUuid: actor.uuid, name: actor.name },
        participants: null,
        targets: [...game.user.targets].map((target) => {
          const token = target.document ?? target;
          return { tokenUuid: token.uuid, actorUuid: token.actor?.uuid, name: token.name };
        }),
      });
    }
    const giver = this.combat.combatants.get(this.giverParticipantId);
    if (!giver?.actor)
      return { participantId: null, name: "Unavailable", error: "The giver is no longer in this encounter." };
    return selectPotionRecipient({
      giver: { id: giver.id, actorUuid: giver.actor.uuid, name: giver.name },
      participants: this.combat.combatants
        .filter((entry) => entry.actor && (!entry.hidden || game.user.isGM))
        .map((entry) => ({
          id: entry.id, name: entry.name, actorUuid: entry.actor.uuid,
          tokenUuid: entry.token?.uuid ?? null,
        })),
      targets: [...game.user.targets].map((target) => {
        const token = target.document ?? target;
        return { tokenUuid: token.uuid, actorUuid: token.actor?.uuid ?? null };
      }),
    });
  }

  values() {
    return {
      bottleItemUuid:
        this.element.querySelector("[name=bottleUuid]")?.value ||
        this.bottleItemUuid || this.currentPreview?.bottleUuid || this.sourceItem.uuid,
      recipientParticipantId: this.recipientSelection().participantId,
      recipientTokenUuid: this.recipientSelection().tokenUuid ?? null,
      continuesAfterInterruption:
        this.element.querySelector("[name=interruption]")?.value !== "interrupted",
      willing:
        this.element.querySelector("[name=willing]")?.checked === true,
      geometryOverride: this.element.querySelector("[name=geometryOverride]")?.checked === true,
      daWillingness: this.element.querySelector("[name=daWillingness]")?.checked === true,
      geometryReason:
        this.element.querySelector("[name=geometryReason]")?.value?.trim() ?? "",
      daWillingnessReason:
        this.element.querySelector("[name=daWillingnessReason]")?.value?.trim() ??
        "",
    };
  }

  setText(name, value) {
    const element = this.element.querySelector(`[data-preview="${name}"]`);
    if (element) element.textContent = value;
  }

  async refreshPreview() {
    const revision = ++this.previewRevision,
      selection = this.recipientSelection(),
      submitButton = this.element.querySelector("[data-action=submit]");
    if (submitButton) submitButton.disabled = true;
    this.currentPreview = null;
    if (this.recipientIdentity !== `${selection.participantId}:${selection.tokenUuid ?? ""}`) {
      for (const name of ["willing", "geometryOverride", "daWillingness", "geometryReason", "daWillingnessReason"]) {
        const input = this.element.querySelector(`[name=${name}]`);
        if (input?.type === "checkbox") input.checked = false;
        else if (input) input.value = "";
      }
      this.recipientIdentity = `${selection.participantId}:${selection.tokenUuid ?? ""}`;
      this.recipientParticipantId = selection.participantId;
    }
    const values = this.values(),
      preview = selection.error
        ? { error: selection.error, canDeclare: false }
        : await safePreview({
            sourceItemUuid: this.sourceItem.uuid,
            bottleItemUuid: values.bottleItemUuid,
            combatUuid: this.combatUuid,
            giverParticipantId: this.giverParticipantId,
            recipientParticipantId: values.recipientParticipantId,
        recipientTokenUuid: values.recipientTokenUuid,
            continuesAfterInterruption: values.continuesAfterInterruption,
          }),
      geometry = await geometryPreview(
        preview,
        this.giverParticipantId,
        values.recipientParticipantId,
      );
    const recipient = preview.recipientActorUuid
      ? await fromUuid(preview.recipientActorUuid) : null;
    if (revision !== this.previewRevision) return false;
    this.currentPreview = preview;
    this.currentGeometry = geometry;
    this.setText("recipient-name", selection.name);
    const healing = preview.healing,
      conditionLabels = preview.conditions
        ? Object.entries(preview.conditions)
            .filter(([, value]) => Boolean(value))
            .map(([key, value]) =>
              value === true ? key : `${key} ${value}`,
            )
            .join(", ")
        : "";
    this.setText("bottle", preview.bottleName ?? "Unavailable");
    this.setText("recipient", preview.recipientActorName ?? "Unavailable");
    this.setText(
      "healing",
      healing
        ? `+${healing.restored} HP (${healing.after - healing.restored} → ${healing.after})`
        : "Healing cannot be calculated.",
    );
    this.setText(
      "hands",
      preview.outsideCombat ? "Outside encounter" : "1 Maneuver",
    );
    this.setText(
      "reaction",
      preview.reactionRequired
        ? "Recipient: 1 Reaction"
        : "",
    );
    this.setText(
      "supply",
      preview.inventoryDie
        ? `After successful healing, roll only d${preview.inventoryDie}. A result of 1 lowers supply; the final d4 use still works.`
        : "This bottle's supply is out.",
    );
    this.setText(
      "conditions",
      conditionLabels,
    );
    this.setText(
      "geometry-status",
      geometry.known
        ? geometry.adjacent
          ? `Native grid: ${geometry.distance === 0 ? "same participant" : `${geometry.distance} square(s)`}; adjacent.`
          : `Native grid: ${geometry.distance} square(s); not adjacent.`
        : geometry.reason ??
          geometry.error ??
          "Range unavailable; use the intended recipient.",
    );
    const error = preview.error || preview.sourceError || "";
    this.setText("error", error);
    const ownsRecipient = recipient?.testUserPermission(game.user, "OWNER"),
      willingnessReady =
        preview.relation === "self" ||
        (!ownsRecipient && !game.user.isGM) ||
        values.willing ||
        (game.user.isGM && values.daWillingness),
      willingPanel = this.element.querySelector("[data-panel=willingness]");
    if (willingPanel) {
      willingPanel.hidden = preview.relation !== "other";
      const confirmation = willingPanel.querySelector("[data-willing-confirm]");
      if (confirmation) confirmation.hidden = !ownsRecipient;
      const prompt = willingPanel.querySelector("[data-willing-prompt]");
      if (prompt)
        prompt.textContent = ownsRecipient
          ? "Confirm this recipient is willing."
          : "Their owner will receive a consent request.";
    }
    const submit = this.element.querySelector("[data-action=submit]");
    if (submit) {
      submit.textContent = preview.relation === "other" && !ownsRecipient && !game.user.isGM ? "Offer potion" : "Use potion";
      submit.disabled = Boolean(
        error ||
          !preview.canDeclare ||
          !willingnessReady,
      );
    }
    return true;
  }

  static async submit() {
    try {
      if (!(await this.refreshPreview()))
        throw new Error("The target changed. Review the current recipient.");
      const values = this.values();
      if (!this.currentPreview?.canDeclare)
        throw new Error(
          this.currentPreview?.error ||
            "This potion use cannot be declared in the current state.",
        );
      if (values.recipientParticipantId !== this.currentPreview.recipientParticipantId ||
          values.recipientTokenUuid !== (this.currentPreview.outsideCombat ? this.currentPreview.recipientTokenUuid : values.recipientTokenUuid))
        throw new Error("The target changed. Review the current recipient.");
      const geometry =
        game.user.isGM && values.geometryOverride
          ? { mode: "da-ruling", reason: values.geometryReason }
          : { mode: "native" };
      const result = await requestPotionUse({
        sourceItemUuid: this.sourceItem.uuid,
        bottleItemUuid: values.bottleItemUuid,
        combatUuid: this.combatUuid,
        giverParticipantId: this.giverParticipantId,
        recipientParticipantId: values.recipientParticipantId,
        recipientTokenUuid: values.recipientTokenUuid,
        willing: values.willing,
        continuesAfterInterruption: values.continuesAfterInterruption,
        geometry,
        daWillingnessReason: values.daWillingnessReason,
        daWillingness: values.daWillingness,
        expected: this.currentPreview.expected,
      });
      ui.notifications.info(
        result.status === "proposal"
          ? "Potion offered."
          : "Potion requested.",
      );
      await this.close();
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }
}

export async function openPotionPreparation(
  sourceItem,
  { bottleItemUuid = null } = {},
) {
  if (
    !isPotionAbility(sourceItem) &&
    !isHealingPotionItem(sourceItem)
  )
    throw new Error("Choose a reviewed healing potion source.");
  return new PotionPreparation(sourceItem, { bottleItemUuid }).render({
    force: true,
  });
}
