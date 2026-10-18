import {
  isHealingPotionItem,
  isPotionAbility,
  potionCombatContext,
  previewPotionAdjacency,
  previewPotionUse,
  requestPotionUse,
} from "../services/potions.mjs";

function healthLabel(actor) {
  const hp = actor?.system?.health?.value ?? 0,
    max = actor?.system?.health?.max ?? actor?.system?.health?.baseMax ?? 0;
  return `HP ${hp}/${max}`;
}

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
  }

  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-potion-preparation"],
    window: { title: "Prepare healing potion", resizable: true },
    position: { width: 760, height: 820 },
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
        null,
      recipients = combat.combatants
        .filter(
          (entry) => entry.actor && (!entry.hidden || game.user.isGM),
        )
        .map((entry) => ({
          id: entry.id,
          name:
            entry.actor.uuid === this.sourceItem.actor.uuid
              ? `${entry.name} (self)`
              : entry.name,
          actorUuid: entry.actor.uuid,
          health: healthLabel(entry.actor),
          self: entry.actor.uuid === this.sourceItem.actor.uuid,
        }))
        .sort(
          (a, b) =>
            Number(b.self) - Number(a.self) || a.name.localeCompare(b.name),
        );
    this.combatUuid = combat.uuid;
    this.giverParticipantId = combatant.id;
    const initialRecipient = recipients.find((entry) => entry.self) ?? recipients[0],
      preview = selectedBottle
        ? await safePreview({
            sourceItemUuid: this.sourceItem.uuid,
            bottleItemUuid: selectedBottle.uuid,
            combatUuid: combat.uuid,
            giverParticipantId: combatant.id,
            recipientParticipantId: initialRecipient?.id,
            continuesAfterInterruption: true,
          })
        : { error: "This character has no healing bottle.", canDeclare: false },
      recipientActor =
        initialRecipient && (await fromUuid(initialRecipient.actorUuid)),
      geometry = await geometryPreview(
        preview,
        combatant.id,
        initialRecipient?.id,
      );
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
      sourceIsBottle: this.sourceItem.type === "equipment",
      selectedBottleUuid: selectedBottle?.uuid ?? "",
      recipients,
      selectedRecipientId: initialRecipient?.id ?? "",
      preview,
      geometry,
      canAttestWillingness: Boolean(
        recipientActor?.testUserPermission(game.user, "OWNER") ||
          game.user.isGM,
      ),
      ownsRecipient: Boolean(
        recipientActor?.testUserPermission(game.user, "OWNER"),
      ),
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    for (const selector of [
      "[name=bottleUuid]",
      "[name=interruption]",
      "[name=willing]",
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
    this.element
      .querySelector("[name=recipientParticipantId]")
      ?.addEventListener("change", () => {
        const willing = this.element.querySelector("[name=willing]"),
          geometry = this.element.querySelector("[name=geometryReason]");
        if (willing) willing.checked = false;
        if (geometry) geometry.value = "";
        void this.refreshPreview();
      });
    await this.refreshPreview();
  }

  values() {
    return {
      bottleItemUuid:
        this.element.querySelector("[name=bottleUuid]")?.value ||
        this.sourceItem.uuid,
      recipientParticipantId:
        this.element.querySelector("[name=recipientParticipantId]")?.value,
      continuesAfterInterruption:
        this.element.querySelector("[name=interruption]")?.value === "continue",
      willing:
        this.element.querySelector("[name=willing]")?.checked === true,
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
    const values = this.values(),
      preview = await safePreview({
        sourceItemUuid: this.sourceItem.uuid,
        bottleItemUuid: values.bottleItemUuid,
        combatUuid: this.combatUuid,
        giverParticipantId: this.giverParticipantId,
        recipientParticipantId: values.recipientParticipantId,
        continuesAfterInterruption: values.continuesAfterInterruption,
      }),
      geometry = await geometryPreview(
        preview,
        this.giverParticipantId,
        values.recipientParticipantId,
      );
    this.currentPreview = preview;
    this.currentGeometry = geometry;
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
        ? `Fixed ${preview.baseHealing} before Life resistance; resistance ${healing.resistance}; restore ${healing.restored}; HP after ${healing.after}`
        : "Healing cannot be calculated.",
    );
    this.setText(
      "hands",
      `Free hands ${preview.freeHands ?? 0}; Maneuver remaining ${preview.maneuverRemaining ?? 0}`,
    );
    this.setText(
      "reaction",
      preview.reactionRequired
        ? `Recipient spends one Reaction (${preview.reactionAvailable ? "available" : "unavailable"}).`
        : "No recipient Reaction is required.",
    );
    this.setText(
      "supply",
      preview.inventoryDie
        ? `After successful healing, roll only d${preview.inventoryDie}. A result of 1 lowers supply; the final d4 use still works.`
        : "This bottle's supply is out.",
    );
    this.setText(
      "conditions",
      conditionLabels || "No recorded action restrictions.",
    );
    this.setText(
      "geometry-status",
      geometry.known
        ? geometry.adjacent
          ? `Native grid: ${geometry.distance === 0 ? "same participant" : `${geometry.distance} square(s)`}; adjacent.`
          : `Native grid: ${geometry.distance} square(s); not adjacent.`
        : geometry.reason ??
          geometry.error ??
          "Native geometry is unavailable; the DA must record a judgment.",
    );
    const error =
      preview.error ||
      preview.sourceError ||
      (!geometry.adjacent && !(game.user.isGM && values.geometryReason)
        ? "A recipient must be adjacent before this use can be submitted."
        : "");
    this.setText("error", error);
    const recipient = preview.recipientActorUuid
        ? await fromUuid(preview.recipientActorUuid)
        : null,
      ownsRecipient = recipient?.testUserPermission(game.user, "OWNER"),
      willingnessReady =
        preview.relation === "self" ||
        (!ownsRecipient && !game.user.isGM) ||
        values.willing ||
        (game.user.isGM && Boolean(values.daWillingnessReason)),
      willingPanel = this.element.querySelector("[data-panel=willingness]");
    if (willingPanel) {
      willingPanel.hidden = preview.relation !== "other";
      const prompt = willingPanel.querySelector("[data-willing-prompt]");
      if (prompt)
        prompt.textContent = ownsRecipient
          ? "The selected recipient must explicitly confirm willingness."
          : "The selected recipient will receive a consent request in chat.";
    }
    const submit = this.element.querySelector("[data-action=submit]");
    if (submit) {
      submit.disabled = Boolean(
        error ||
          !preview.canDeclare ||
          !willingnessReady ||
          (!geometry.adjacent &&
            !(game.user.isGM && values.geometryReason)),
      );
    }
  }

  static async submit() {
    try {
      const values = this.values();
      if (!this.currentPreview?.canDeclare)
        throw new Error(
          this.currentPreview?.error ||
            "This potion use cannot be declared in the current state.",
        );
      const geometry =
        game.user.isGM && values.geometryReason
          ? { mode: "da-ruling", reason: values.geometryReason }
          : { mode: "native" };
      const result = await requestPotionUse({
        sourceItemUuid: this.sourceItem.uuid,
        bottleItemUuid: values.bottleItemUuid,
        combatUuid: this.combatUuid,
        giverParticipantId: this.giverParticipantId,
        recipientParticipantId: values.recipientParticipantId,
        willing: values.willing,
        continuesAfterInterruption: values.continuesAfterInterruption,
        geometry,
        daWillingnessReason: values.daWillingnessReason,
        expected: this.currentPreview.expected,
      });
      ui.notifications.info(
        result.status === "proposal"
          ? "Recipient consent request posted to chat."
          : "Healing potion request sent to the automation coordinator.",
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
