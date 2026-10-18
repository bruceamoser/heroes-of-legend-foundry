import {
  HEALING_POTION_IDS,
  healingPotionAdapter,
  planHealingPotion,
} from "../rules/potions.mjs";
import { healingPlan } from "../rules/damage.mjs";
import { handLayout } from "../rules/hands.mjs";
import { inventoryCheck } from "../rules/inventory.mjs";
import {
  linkedPotionOperationId,
  normalizePotionGeometry,
  potionGeometryRulingAuthorized,
  potionNote,
  potionOperationNextPhase,
  potionSourceMatches,
  validatePotionEncounterReceipts,
  verifyPotionSupplyItems,
} from "../rules/potion-operation.mjs";
import {
  survivalState,
  validateSurvival,
} from "../rules/survival.mjs";
import {
  enqueueCharacterOperation,
  isCreationAuthority,
  writeAuthorityDocument,
} from "./authority.mjs";
import { loadCatalogs } from "./catalog.mjs";
import { damageBasis } from "./damage.mjs";
import {
  inventoryBasis,
  validateEmbeddedItems,
} from "./inventory.mjs";
import { actionConditions } from "./turn-budget.mjs";
import { assertNoPendingTurn } from "./turn-lock.mjs";
import { nativeTokenAdjacency } from "./native-adjacency.mjs";

const ID = "heroes-of-legend",
  POTION_ABILITY_ID = "ability-use-a-healing-potion",
  POTION_IDS = new Set(HEALING_POTION_IDS);

const clone = (value) => structuredClone(value);
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
};
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const mechanicalBottleBasis = (basis) => {
  const copy = clone(basis);
  if (copy?.item) delete copy.item.name;
  return copy;
};
const sameBottleBasis = (left, right) =>
  same(mechanicalBottleBasis(left), mechanicalBottleBasis(right));
const escaped = (value) => foundry.utils.escapeHTML(String(value));


export function isPotionAbility(item) {
  return Boolean(
    item?.documentName === "Item" &&
      item.type === "ability" &&
      item.getFlag(ID, "catalogId") === POTION_ABILITY_ID,
  );
}

export function isHealingPotionItem(item) {
  return Boolean(
    item?.documentName === "Item" &&
      item.type === "equipment" &&
      POTION_IDS.has(item.system?.catalogId),
  );
}

function assertWorldActor(actor, label = "Actor") {
  if (actor?.documentName !== "Actor" || actor.pack)
    throw new Error(`${label} must be an available world Actor.`);
  return actor;
}

function itemSourceSnapshot(item) {
  return {
    itemId: item.id,
    itemUuid: item.uuid,
    name: item.name,
    type: item.type,
    actorId: item.actor?.id ?? null,
    actorUuid: item.actor?.uuid ?? null,
    catalogId:
      item.type === "equipment"
        ? item.system.catalogId
        : item.getFlag(ID, "catalogId"),
    source: clone(item.getFlag(ID, "source") ?? null),
  };
}

function recognizedPotionSource(sourceItem) {
  if (isPotionAbility(sourceItem)) return { kind: "ability" };
  if (isHealingPotionItem(sourceItem)) return { kind: "equipment" };
  throw new Error("Choose the reviewed Use a Healing Potion action or bottle.");
}

function recognizedPotionItem(item, catalog) {
  if (!isHealingPotionItem(item))
    throw new Error("Choose an exact owned healing bottle.");
  const potion = healingPotionAdapter(item.system.catalogId, catalog);
  if (
    !potionSourceMatches(item.getFlag(ID, "source") ?? null, potion.source)
  )
    throw new Error("The selected healing bottle source changed.");
  return potion;
}

function canonicalSurvival(actor, basis) {
  if (actor.type !== "character") {
    if (basis.hp === 0)
      throw new Error("A defeated creature needs an explicit DA exception.");
    return survivalState({
      hp: basis.hp,
      maxHp: basis.maxHp,
      gritAvailable: 0,
      ownTurn: 0,
    });
  }
  if (basis.survival?.hp !== undefined && basis.survival.hp !== basis.hp)
    throw new Error(
      "HP was edited outside survival tracking. Reconcile it before using a potion.",
    );
  const state = basis.survival
    ? {
        ...basis.survival,
        maxHp: basis.maxHp,
        gritAvailable: basis.gritAvailable,
      }
    : survivalState({
        hp: basis.hp,
        maxHp: basis.maxHp,
        gritAvailable: basis.gritAvailable,
        ownTurn: 0,
      });
  validateSurvival(state);
  return state;
}

function actorPotionBasis(actor) {
  assertWorldActor(actor);
  if (actor.type === "summon")
    throw new Error("Summons cannot use or receive ordinary healing potions.");
  if (!["character", "creature"].includes(actor.type))
    throw new Error("This Actor cannot participate in ordinary potion use.");
  const damage = damageBasis(actor),
    survival = canonicalSurvival(actor, damage);
  return clone({
    actorId: actor.id,
    actorUuid: actor.uuid,
    actorName: actor.name,
    actorType: actor.type,
    hp: damage.hp,
    maxHp: damage.maxHp,
    gritAvailable: damage.gritAvailable,
    survival,
    revision: damage.revision,
    equipmentRevision: damage.equipmentRevision,
    inventoryRevision: actor.getFlag(ID, "inventoryRevision") ?? 0,
    passiveDefenses: damage.passiveDefenses,
    lifeResistances: (damage.passiveDefenses?.resistances ?? [])
      .filter((source) => source.type === "life")
      .map((source) => source.value),
    handCapacity: actor.getFlag(ID, "handCapacity") ?? 2,
    items: actor.items
      .filter((item) => item.type === "equipment")
      .map((item) => ({
        id: item.id,
        hands: item.system.hands,
        held: item.system.held,
      })),
    conditions: clone(actionConditions(actor)),
  });
}

function assertBasisCurrent(actor, expected, label) {
  const current = actorPotionBasis(actor);
  if (!same(current, expected))
    throw new Error(
      `${label} changed after this potion was prepared. Review the current state.`,
    );
  return current;
}

export function potionCombatContext(sourceItem) {
  const actor = sourceItem?.actor;
  if (!actor) throw new Error("This potion source is not owned by an Actor.");
  const matches = game.combats.contents.flatMap((combat) => {
    const encounter = combat.getFlag(ID, "encounter");
    return combat.combatants
      .filter(
        (combatant) =>
          combatant.actor?.uuid === actor.uuid &&
          encounter?.current === combatant.id,
      )
      .map((combatant) => ({ combat, combatant, encounter }));
  });
  if (matches.length !== 1)
    throw new Error(
      "Select this character's turn in exactly one encounter before using a potion.",
    );
  return matches[0];
}

async function resolveCombat(combatUuid) {
  if (typeof combatUuid !== "string" || !combatUuid.trim())
    throw new Error("The potion encounter identity is missing.");
  const combat = await fromUuid(combatUuid);
  if (combat?.documentName !== "Combat")
    throw new Error("The potion encounter is unavailable.");
  return combat;
}

function nativeCombatantAdjacency(giverCombatant, recipientCombatant) {
  const giverToken = giverCombatant?.token,
    recipientToken = recipientCombatant?.token;
  if (!giverToken || !recipientToken)
    return {
      known: false,
      adjacent: null,
      distance: null,
      reason: "The potion participants have no exact tokens.",
    };
  return nativeTokenAdjacency(giverToken, recipientToken);
}

export async function previewPotionAdjacency(
  combatUuid,
  giverParticipantId,
  recipientParticipantId,
  relation = "other",
) {
  const combat = await resolveCombat(combatUuid),
    giver = combat.combatants.get(giverParticipantId),
    recipient = combat.combatants.get(recipientParticipantId);
  if (!giver || !recipient)
    throw new Error("The potion participants changed.");
  if (relation === "self")
    return { known: true, distance: 0, adjacent: true };
  return nativeCombatantAdjacency(giver, recipient);
}

function geometryFor({
  giverParticipant,
  recipientParticipant,
  relation,
  requested,
  sourceAuthor,
}) {
  if (relation === "self")
    return { adjacent: true, kind: "self", distance: null, userId: null };
  if (
    requested?.mode === "da-ruling" &&
    potionGeometryRulingAuthorized(requested, sourceAuthor)
  )
    return {
      adjacent: true,
      kind: "da-ruling",
      distance: null,
      userId: requested.userId,
      reason: potionNote(requested.reason),
    };
  if (requested?.mode !== "native")
    throw new Error(
      "The recorded potion geometry ruling does not belong to the actual DA.",
    );
  const native = nativeCombatantAdjacency(
    giverParticipant,
    recipientParticipant,
  );
  if (!native.known || typeof native.adjacent !== "boolean")
    throw new Error(
      native.reason ??
        "The grid cannot decide adjacency here. The DA must record a geometry judgment.",
    );
  if (!native.adjacent)
    throw new Error(
      `The selected recipient is not adjacent (native distance ${native.distance ?? "unavailable"}).`,
    );
  return {
    adjacent: true,
    kind: "native",
    distance: native.distance,
    userId: null,
  };
}

function healingForBasis(potion, basis) {
  if (!potion) return null;
  return healingPlan({
    amount: potion.healing,
    current: basis.hp,
    max: basis.maxHp,
    lifeResistances: basis.lifeResistances,
    recipientKind: basis.actorType,
  });
}

function potionExpectation(giverBasis, recipientBasis, bottle) {
  const actor = (basis) => ({
    actorUuid: basis.actorUuid,
    hp: basis.hp,
    maxHp: basis.maxHp,
    survival: clone(basis.survival),
    revision: basis.revision,
    equipmentRevision: basis.equipmentRevision,
    inventoryRevision: basis.inventoryRevision,
    lifeResistances: clone(basis.lifeResistances),
    conditions: clone(basis.conditions),
  });
  return {
    giver: actor(giverBasis),
    recipient: actor(recipientBasis),
    bottle: {
      itemId: bottle.id,
      itemUuid: bottle.uuid,
      catalogId: bottle.system.catalogId,
      inventoryDie: bottle.system.inventoryDie,
      quantity: bottle.system.quantity,
      source: clone(bottle.getFlag(ID, "source") ?? null),
    },
  };
}

function plannerInputs({
  operationId,
  giverBasis,
  recipientBasis,
  turn,
  recipientTurn,
  relation,
  adjacent = true,
  willing = true,
  capable,
}) {
  return {
    operationId,
    giver: {
      actorId: giverBasis.actorUuid,
      ownTurn: true,
      turn: clone(turn),
      items: clone(giverBasis.items),
      handCapacity: giverBasis.handCapacity,
      survival: clone(giverBasis.survival),
      conditions: clone(giverBasis.conditions),
    },
    recipient: {
      actorId: recipientBasis.actorUuid,
      kind: recipientBasis.actorType,
      turn: clone(recipientTurn),
      survival: clone(recipientBasis.survival),
      lifeResistances: clone(recipientBasis.lifeResistances),
      conditions: clone(recipientBasis.conditions),
    },
    relation,
    ...(relation === "other" ? { adjacent, willing } : {}),
    capable,
    recipientOperationId: linkedPotionOperationId(operationId, "reaction"),
  };
}

/**
 * Pure-to-the-caller native preview. It reads documents but reserves nothing.
 */
export async function previewPotionUse({
  sourceItemUuid,
  bottleItemUuid = null,
  combatUuid = null,
  giverParticipantId = null,
  recipientParticipantId = null,
  continuesAfterInterruption = true,
} = {}) {
  const sourceItem = await fromUuid(sourceItemUuid),
    actor = assertWorldActor(sourceItem?.actor, "Potion giver");
  recognizedPotionSource(sourceItem);
  if (actor.type !== "character")
    throw new Error("Only a character can give or use an ordinary potion.");
  const { combat, combatant: giverCombatant, encounter } = combatUuid
      ? await (async () => {
          const combat = await resolveCombat(combatUuid),
            encounter = combat.getFlag(ID, "encounter"),
            combatant = combat.combatants.get(
              giverParticipantId ?? encounter?.current,
            );
          if (!combatant || combatant.actor?.uuid !== actor.uuid)
            throw new Error("The potion giver's combatant changed.");
          return { combat, combatant, encounter };
        })()
      : potionCombatContext(sourceItem),
    participantId = giverParticipantId ?? giverCombatant.id,
    recipientId = recipientParticipantId ?? participantId,
    recipientCombatant = combat.combatants.get(recipientId),
    giverBudget = encounter?.budgets?.[participantId],
    recipientBudget = encounter?.budgets?.[recipientId];
  if (
    encounter?.current !== participantId ||
    !giverBudget ||
    !recipientCombatant ||
    !recipientBudget
  )
    throw new Error(
      "Both potion participants need active encounter budgets and the giver must have the current turn.",
    );
  const recipientActor = assertWorldActor(
      recipientCombatant.actor,
      "Potion recipient",
    ),
    relation = recipientActor.uuid === actor.uuid ? "self" : "other",
    giverBasis = actorPotionBasis(actor),
    recipientBasis =
      relation === "self" ? clone(giverBasis) : actorPotionBasis(recipientActor);
  if (relation === "self" && recipientCombatant.id !== giverCombatant.id)
    throw new Error(
      "Self use must use the giver's own combatant and action budget.",
    );
  let bottle = null,
    sourceError = null;
  try {
    const catalog = (await loadCatalogs()).inventory;
    if (sourceItem.type === "equipment") {
      if (bottleItemUuid && bottleItemUuid !== sourceItem.uuid)
        throw new Error("An equipment route must use that exact bottle Item.");
      bottle = sourceItem;
    } else {
      bottle = bottleItemUuid ? await fromUuid(bottleItemUuid) : null;
    }
    if (!bottle || bottle.actor?.uuid !== actor.uuid)
      throw new Error("Choose a healing bottle owned by this character.");
    const potion = recognizedPotionItem(bottle, catalog),
      action = catalog.acquisitions.find(
        (record) => record.id === POTION_ABILITY_ID,
      );
    if (
      sourceItem.type === "ability" &&
      !potionSourceMatches(
        sourceItem.getFlag(ID, "source") ?? null,
        action?.source ?? {},
      )
    )
      throw new Error("The Use a Healing Potion action source changed.");
    const layout = handLayout(
        giverBasis.items,
        giverBasis.handCapacity,
      ),
      healing = healingForBasis(potion, recipientBasis),
      reactionRequired =
        relation === "other" && recipientBasis.hp > 0,
      previewPlan =
        bottle.system.inventoryDie === potion.supplyDie
          ? planHealingPotion({
              potionId: bottle.system.catalogId,
              catalog,
              inventoryDie: bottle.system.inventoryDie,
              ...plannerInputs({
                operationId: "potion_preview",
                giverBasis,
                recipientBasis,
                turn: giverBudget,
                recipientTurn: recipientBudget,
                relation,
                capable: Boolean(continuesAfterInterruption),
              }),
            })
          : null;
    return {
      combatUuid: combat.uuid,
      combatName: combat.name,
      giverParticipantId: participantId,
      giverActorUuid: actor.uuid,
      giverActorName: actor.name,
      recipientParticipantId: recipientId,
      recipientActorUuid: recipientActor.uuid,
      recipientActorName: recipientActor.name,
      recipientTokenUuid: recipientCombatant.token?.uuid ?? null,
      relation,
      bottleUuid: bottle.uuid,
      bottleName: bottle.name,
      bottleCatalogId: bottle.system.catalogId,
      inventoryDie: bottle.system.inventoryDie,
      baseHealing: potion.healing,
      healing,
      reactionRequired,
      reactionAvailable:
        !reactionRequired || recipientBudget.remaining.reaction > 0,
      maneuverRemaining: giverBudget.remaining.maneuver,
      freeHands: layout.free,
      giverOwnTurn: encounter.current === participantId,
      conditions: giverBasis.conditions,
      planStatus: previewPlan?.status ?? "unavailable",
      canDeclare: Boolean(previewPlan),
      expected: potionExpectation(giverBasis, recipientBasis, bottle),
      sourceError,
    };
  } catch (error) {
    sourceError = error.message;
    let potion = null;
    if (POTION_IDS.has(bottle?.system?.catalogId)) {
      try {
        potion = healingPotionAdapter(
          bottle.system.catalogId,
          (await loadCatalogs()).inventory,
        );
      } catch {
        potion = null;
      }
    }
    return {
      combatUuid: combat.uuid,
      combatName: combat.name,
      giverParticipantId: participantId,
      giverActorUuid: actor.uuid,
      giverActorName: actor.name,
      recipientParticipantId: recipientId,
      recipientActorUuid: recipientActor.uuid,
      recipientActorName: recipientActor.name,
      recipientTokenUuid: recipientCombatant.token?.uuid ?? null,
      relation,
      bottleUuid: bottle?.uuid ?? null,
      bottleName: bottle?.name ?? "No bottle",
      bottleCatalogId: bottle?.system?.catalogId ?? null,
      inventoryDie: bottle?.system?.inventoryDie ?? 0,
      baseHealing: potion?.healing ?? 0,
      healing: potion ? healingForBasis(potion, recipientBasis) : null,
      reactionRequired: relation === "other" && recipientBasis.hp > 0,
      reactionAvailable:
        relation !== "other" ||
        recipientBasis.hp === 0 ||
        recipientBudget.remaining.reaction > 0,
      maneuverRemaining: giverBudget.remaining.maneuver,
      freeHands: (() => {
        try {
          return handLayout(giverBasis.items, giverBasis.handCapacity).free;
        } catch {
          return 0;
        }
      })(),
      giverOwnTurn: encounter.current === participantId,
      conditions: giverBasis.conditions,
      planStatus: "unavailable",
      canDeclare: false,
      sourceError,
    };
  }
}

function requestRecipients(giver, recipient) {
  return game.users
    .filter(
      (user) =>
        user.isGM ||
        user.id === game.user.id ||
        giver.testUserPermission(user, "OWNER") ||
        recipient.testUserPermission(user, "OWNER"),
    )
    .map((user) => user.id);
}

function requestBase(preview, request) {
  return {
    sourceItemUuid: request.sourceItemUuid,
    bottleItemUuid: preview.bottleUuid,
    giverActorUuid: preview.giverActorUuid,
    giverParticipantId: preview.giverParticipantId,
    recipientActorUuid: preview.recipientActorUuid,
    recipientParticipantId: preview.recipientParticipantId,
    recipientTokenUuid: preview.recipientTokenUuid,
    combatUuid: preview.combatUuid,
    revision: request.revision,
    relation: preview.relation,
    continuesAfterInterruption: request.continuesAfterInterruption,
    geometry: clone(request.geometry ?? { mode: "native" }),
    expected: clone(preview.expected),
  };
}

function bareBase(request) {
  const {
    proposalId: _proposalId,
    willingness: _willingness,
    ...base
  } = request;
  return base;
}

export async function requestPotionUse({
  sourceItemUuid,
  bottleItemUuid = null,
  combatUuid,
  giverParticipantId,
  recipientParticipantId,
  willing = false,
  continuesAfterInterruption,
  geometry = { mode: "native" },
  daWillingnessReason = "",
  daWillingness = false,
  expected = null,
}) {
  if (typeof continuesAfterInterruption !== "boolean")
    throw new Error(
      "Record whether the action continues after its interruption check.",
    );
  if (typeof daWillingness !== "boolean" || (daWillingness && !game.user.isGM))
    throw new Error("Only the DA can choose a willingness ruling.");
  const requestedGeometry = normalizePotionGeometry(geometry, game.user);
  const sourceItem = await fromUuid(sourceItemUuid),
    giver = assertWorldActor(sourceItem?.actor, "Potion giver");
  if (!giver.testUserPermission(game.user, "OWNER") && !game.user.isGM)
    throw new Error("Only the giver's owner or the DA can prepare this use.");
  if (!game.settings.get(ID, "creationAuthorityClient"))
    throw new Error("Enable the GM automation coordinator first.");
  const preview = await previewPotionUse({
      sourceItemUuid,
      bottleItemUuid,
      combatUuid,
      giverParticipantId,
      recipientParticipantId,
      continuesAfterInterruption,
    }),
    recipient = await fromUuid(preview.recipientActorUuid);
  if (!preview.canDeclare)
    throw new Error(
      preview.sourceError ?? "This potion use is unavailable in the current state.",
    );
  if (expected && !same(expected, preview.expected))
    throw new Error(
      "The potion state changed while the dialog was open. Review the current bottle, recipients and costs again.",
    );
  const combat = await resolveCombat(preview.combatUuid),
    encounter = combat.getFlag(ID, "encounter"),
    giverCombatant = combat.combatants.get(preview.giverParticipantId),
    recipientCombatant = combat.combatants.get(
      preview.recipientParticipantId,
    ),
    sourceAuthor = game.users.get(game.user.id) ?? game.user;
  if (!giverCombatant || !recipientCombatant)
    throw new Error("The potion participants changed.");
  geometryFor({
    giverParticipant: giverCombatant,
    recipientParticipant: recipientCombatant,
    relation: preview.relation,
    requested: requestedGeometry,
    sourceAuthor,
  });
  const base = requestBase(preview, {
      sourceItemUuid,
      revision: encounter.revision,
      continuesAfterInterruption,
      geometry: requestedGeometry,
    }),
    ownsRecipient = recipient.testUserPermission(game.user, "OWNER");
  if (preview.relation === "other" && !ownsRecipient && !game.user.isGM) {
    const proposal = {
        ...base,
        proposerId: game.user.id,
        giverName: giver.name,
        recipientName: recipient.name,
        bottleName: preview.bottleName,
      },
      content = await foundry.applications.handlebars.renderTemplate(
        "systems/heroes-of-legend/templates/potion-proposal.hbs",
        proposal,
      );
    return {
      status: "proposal",
      message: await ChatMessage.create({
        content,
        whisper: requestRecipients(giver, recipient),
        flags: { [ID]: { potionProposal: proposal } },
      }),
    };
  }
  let willingness;
  if (preview.relation === "self")
    willingness = { kind: "self", userId: game.user.id };
  else if (game.user.isGM && daWillingness)
    willingness = {
      kind: "da-ruling",
      userId: game.user.id,
      reason: potionNote(daWillingnessReason),
    };
  else if (ownsRecipient && willing)
    willingness = { kind: "recipient-owner", userId: game.user.id };
  else
    throw new Error(
      "The recipient must explicitly confirm willingness, or the DA must record a ruling.",
    );
  const request = { ...base, willingness };
  return {
    status: "request",
    message: await ChatMessage.create({
      content: "Healing potion use submitted; waiting for the GM coordinator.",
      whisper: requestRecipients(giver, recipient),
      flags: { [ID]: { potionRequest: request } },
    }),
  };
}

export async function acceptPotionProposal(
  proposalId,
  { daReason = "", daWillingness = false } = {},
) {
  const proposalMessage = game.messages.get(proposalId),
    proposal = proposalMessage?.getFlag(ID, "potionProposal"),
    recipient = proposal
      ? await fromUuid(proposal.recipientActorUuid)
      : null;
  if (!proposalMessage?.author || !proposal || !recipient)
    throw new Error("This potion proposal is unavailable.");
  if (typeof daWillingness !== "boolean" || (daWillingness && !game.user.isGM))
    throw new Error("Only the DA can choose a willingness ruling.");
  const ownsRecipient = recipient.testUserPermission(game.user, "OWNER");
  if (!ownsRecipient && !game.user.isGM)
    throw new Error("Only the selected recipient's owner or the DA can confirm.");
  const willingness =
    game.user.isGM && daWillingness
      ? {
          kind: "da-ruling",
          userId: game.user.id,
          reason: potionNote(daReason),
        }
      : ownsRecipient
        ? { kind: "recipient-owner", userId: game.user.id }
        : null;
  if (!willingness)
    throw new Error(
      "Choose the DA willingness ruling to confirm this recipient.",
    );
  const existing = game.messages.find(
    (message) => message.getFlag(ID, "potionRequest")?.proposalId === proposalId,
  );
  if (existing)
    return { status: "request", message: existing, reused: true };
  const request = { ...clone(proposal), proposalId, willingness };
  delete request.proposerId;
  delete request.giverName;
  delete request.recipientName;
  delete request.bottleName;
  return {
    status: "request",
    reused: false,
    message: await ChatMessage.create({
      content: "Healing potion recipient consent recorded; waiting for the GM coordinator.",
      whisper: proposalMessage.whisper,
      flags: { [ID]: { potionRequest: request } },
    }),
  };
}

function operationSourceSnapshots(sourceItem, bottle, catalog) {
  const potion = recognizedPotionItem(bottle, catalog),
    action = catalog.acquisitions.find(
      (record) => record.id === POTION_ABILITY_ID,
    );
  if (
    sourceItem.type === "ability" &&
    !potionSourceMatches(
      sourceItem.getFlag(ID, "source") ?? null,
      action?.source ?? {},
    )
  )
    throw new Error("The Use a Healing Potion action source changed.");
  return {
    actionSourceItem: clone(itemSourceSnapshot(sourceItem)),
    bottleItem: clone(itemSourceSnapshot(bottle)),
    potion: clone(potion),
    abilityAction: clone(action),
  };
}

function proposalFor(request) {
  if (!request.proposalId) return null;
  const message = game.messages.get(request.proposalId),
    proposal = message?.getFlag(ID, "potionProposal");
  if (!message?.author || !proposal)
    throw new Error("The recipient consent depends on a missing proposal.");
  const {
    proposerId: _proposerId,
    giverName: _giverName,
    recipientName: _recipientName,
    bottleName: _bottleName,
    ...proposalBase
  } = proposal;
  if (!same(bareBase(request), proposalBase))
    throw new Error("The potion proposal changed after recipient consent.");
  return { message, proposal };
}

function authorizesRequest(message, request, giver, recipient) {
  const proposal = proposalFor(request),
    author = message.author;
  if (!author) return false;
  if (request.relation === "self") {
    if (author.id !== request.willingness?.userId) return false;
    if (request.willingness?.kind !== "self") return false;
    return giver.testUserPermission(author, "OWNER") || author.isGM;
  }
  const giverAuthorized = proposal
    ? proposal.message.author &&
      (giver.testUserPermission(proposal.message.author, "OWNER") ||
        proposal.message.author.isGM)
    : giver.testUserPermission(author, "OWNER") || author.isGM;
  if (!giverAuthorized) return false;
  if (
    request.willingness?.kind === "recipient-owner" &&
    request.willingness.userId === author.id &&
    recipient.testUserPermission(author, "OWNER")
  )
    return true;
  return Boolean(
    request.willingness?.kind === "da-ruling" &&
      request.willingness.userId === author.id &&
      author.isGM &&
      (request.willingness.reason === undefined ||
        typeof request.willingness.reason === "string"),
  );
}

function validateRequestShapes(request) {
  if (!request || typeof request !== "object")
    throw new Error("The potion request is unavailable.");
  for (const key of [
    "sourceItemUuid",
    "bottleItemUuid",
    "giverActorUuid",
    "giverParticipantId",
    "recipientActorUuid",
    "recipientParticipantId",
    "combatUuid",
  ])
    if (typeof request[key] !== "string" || !request[key].trim())
      throw new Error(`The potion request is missing ${key}.`);
  if (!["self", "other"].includes(request.relation))
    throw new Error("The potion request relation is invalid.");
  if (typeof request.continuesAfterInterruption !== "boolean")
    throw new Error("The interruption outcome must be explicit.");
  if (
    !Number.isSafeInteger(request.revision) ||
    request.revision < 0
  )
    throw new Error("The encounter revision is invalid.");
  if (
    !request.geometry ||
    !["native", "da-ruling"].includes(request.geometry.mode)
  )
    throw new Error("The potion geometry choice is invalid.");
  if (
    request.geometry.mode === "da-ruling" &&
    (typeof request.geometry.userId !== "string" ||
      !request.geometry.userId ||
      (request.geometry.reason !== undefined &&
        typeof request.geometry.reason !== "string"))
  )
    throw new Error("The DA potion geometry ruling is incomplete.");
  if (!request.expected)
    throw new Error("The potion request is missing its reviewed snapshot.");
  return request;
}

function operationObject({
  message,
  request,
  combat,
  giver,
  recipient,
  giverCombatant,
  recipientCombatant,
  giverBasis,
  recipientBasis,
  sourceSnapshots,
  bottleBasis,
  plan,
  beforeBudgets,
  geometry,
  encounterRevisionAfter,
}) {
  return clone({
    schemaVersion: 2,
    requestId: message.id,
    combatId: combat.id,
    combatUuid: combat.uuid,
    authorId: message.author.id,
    status: plan.status === "interrupted" ? "interrupted" : "reserved",
    requestSignature: JSON.stringify(request),
    requestSnapshot: request,
    giver: {
      actorId: giver.id,
      actorUuid: giver.uuid,
      participantId: giverCombatant.id,
      tokenUuid: giverCombatant.token?.uuid ?? null,
      turnId: beforeBudgets.giver.turnId,
      actionReceipt:
        plan.giverTurn.operations?.[message.id] ?? null,
      basis: giverBasis,
    },
    recipient: {
      actorId: recipient.id,
      actorUuid: recipient.uuid,
      participantId: recipientCombatant.id,
      tokenUuid: recipientCombatant.token?.uuid ?? request.recipientTokenUuid,
      turnId: beforeBudgets.recipient.turnId,
      reactionReceipt: null,
      basis: recipientBasis,
    },
    source: sourceSnapshots,
    bottleBasis,
    budgets: {
      before: beforeBudgets,
      after: {
        giver: clone(plan.giverTurn),
        recipient: clone(plan.recipientTurn),
      },
    },
    willingness: clone(request.willingness),
    geometry,
    interruption: {
      capable: request.continuesAfterInterruption,
      note: "Explicit table continuation; opportunity automation is not connected.",
    },
    reactionOperationId: linkedPotionOperationId(message.id, "reaction"),
    reactionCommitted: false,
    supplyOperationId: linkedPotionOperationId(message.id, "supply"),
    encounterRevisionAfter,
    plan: clone(plan),
  });
}

async function createOperation(message, request) {
  validateRequestShapes(request);
  const combat = await fromUuid(request.combatUuid);
  if (combat?.documentName !== "Combat")
    throw new Error("The potion encounter is unavailable.");
  const existingForProposal = request.proposalId
    ? Object.values(combat.getFlag(ID, "potionOperations") ?? {}).find(
        (operation) => operation.requestSnapshot?.proposalId === request.proposalId,
      )
    : null;
  if (existingForProposal)
    throw new Error(
      "This proposal already has a potion operation. Resume that operation instead.",
    );
  if (
    combat.getFlag(ID, "pendingPotion") ||
    combat.getFlag(ID, "pendingAbility") ||
    combat.getFlag(ID, "pendingTurnPhase")
  )
    throw new Error("Resolve the pending encounter operation first.");
  const state = combat.getFlag(ID, "encounter"),
    giverCombatant = combat.combatants.get(request.giverParticipantId),
    recipientCombatant = combat.combatants.get(request.recipientParticipantId),
    giver = await fromUuid(request.giverActorUuid),
    recipient = await fromUuid(request.recipientActorUuid),
    sourceItem = await fromUuid(request.sourceItemUuid),
    bottle = await fromUuid(request.bottleItemUuid);
  assertWorldActor(giver, "Potion giver");
  assertWorldActor(recipient, "Potion recipient");
  assertNoPendingTurn(giver);
  if (recipient.uuid !== giver.uuid) assertNoPendingTurn(recipient);
  if (giver.getFlag(ID, "pendingInventory"))
    throw new Error(
      "Finish the giver's pending supply check before using this potion.",
    );
  if (
    giverCombatant?.actor?.uuid !== giver.uuid ||
    recipientCombatant?.actor?.uuid !== recipient.uuid ||
    sourceItem?.actor?.uuid !== giver.uuid ||
    bottle?.actor?.uuid !== giver.uuid ||
    state?.current !== giverCombatant.id ||
    request.revision !== state.revision ||
    (request.recipientTokenUuid &&
      recipientCombatant.token?.uuid !== request.recipientTokenUuid)
  )
    throw new Error("The potion participants or encounter changed. Review it again.");
  if (!authorizesRequest(message, request, giver, recipient))
    throw new Error(
      "The potion request lacks the giver's authorization or the recipient's attributed consent.",
    );
  const giverBudget = state.budgets?.[giverCombatant.id],
    recipientBudget = state.budgets?.[recipientCombatant.id];
  if (!giverBudget || !recipientBudget)
    throw new Error("Both potion participants need active encounter budgets.");
  const giverBasis = actorPotionBasis(giver),
    recipientBasis =
      giver.uuid === recipient.uuid
        ? clone(giverBasis)
        : actorPotionBasis(recipient),
    relation =
      giver.uuid === recipient.uuid ? "self" : "other";
  if (relation !== request.relation)
    throw new Error("The potion target relation changed.");
  if (relation === "self" && recipientCombatant.id !== giverCombatant.id)
    throw new Error(
      "Self use must use the giver's own combatant and action budget.",
    );
  const expected = potionExpectation(giverBasis, recipientBasis, bottle);
  if (!same(expected, request.expected))
    throw new Error(
      "The giver, recipient, healing resistance or exact bottle changed. Review the potion again.",
    );
  const sourceAuthorId = request.proposalId
      ? proposalFor(request).message.author.id
      : message.author.id,
    sourceAuthor = game.users.get(sourceAuthorId),
    geometry = geometryFor({
      giverParticipant: giverCombatant,
      recipientParticipant: recipientCombatant,
      relation,
      requested: request.geometry,
      sourceAuthor,
    }),
    catalog = (await loadCatalogs()).inventory,
    plan = planHealingPotion({
      potionId: bottle.system.catalogId,
      catalog,
      inventoryDie: bottle.system.inventoryDie,
      ...plannerInputs({
        operationId: message.id,
        giverBasis,
        recipientBasis,
        turn: giverBudget,
        recipientTurn: recipientBudget,
        relation,
        adjacent: geometry.adjacent,
        willing: true,
        capable: request.continuesAfterInterruption,
      }),
    }),
    sourceSnapshots = operationSourceSnapshots(sourceItem, bottle, catalog),
    bottleBasis = clone(inventoryBasis(giver, bottle)),
    operation = operationObject({
      message,
      request,
      combat,
      giver,
      recipient,
      giverCombatant,
      recipientCombatant,
      giverBasis,
      recipientBasis,
      sourceSnapshots,
      bottleBasis,
      plan,
      beforeBudgets: {
        giver: clone(giverBudget),
        recipient: clone(recipientBudget),
      },
      geometry,
      encounterRevisionAfter: state.revision + 1,
    }),
    recipientBudgetAfter = clone(plan.recipientTurn ?? recipientBudget),
    next = clone(state);
  operation.budgets.after.recipient = recipientBudgetAfter;
  next.budgets[giverCombatant.id] = clone(plan.giverTurn);
  next.revision++;
  next.history.push({
    kind: "potion",
    operationId: message.id,
    giverId: giverCombatant.id,
    recipientId: recipientCombatant.id,
    relation,
    status: operation.status,
    round: state.round,
    serial: state.serial,
  });
  const changes = {
    [`flags.${ID}.encounter`]: next,
    [`flags.${ID}.potionOperations.${message.id}`]: operation,
    [`flags.${ID}.pendingPotion`]:
      operation.status === "interrupted" ? null : message.id,
  };
  if (operation.status === "interrupted")
    changes[`flags.${ID}.operationReceipts.${message.id}`] =
      settlementReceipt(operation, "interrupted");
  await writeAuthorityDocument(combat, changes);
  return { combat, operation };
}

function currentOperation(combat, id) {
  return clone(combat.getFlag(ID, "potionOperations")?.[id] ?? null);
}

function validateStoredPotionOperation(operation, id, combat) {
  if (
    operation?.schemaVersion !== 2 ||
    operation.requestId !== id ||
    operation.combatId !== combat.id ||
    operation.combatUuid !== combat.uuid ||
    typeof operation.authorId !== "string" ||
    !operation.authorId ||
    !operation.requestSnapshot ||
    operation.requestSignature !== JSON.stringify(operation.requestSnapshot) ||
    ![
      "reserved",
      "interrupted",
      "needs-reconciliation",
      "reconciled-without-supply",
      "complete",
    ].includes(operation.status) ||
    !Number.isSafeInteger(operation.encounterRevisionAfter) ||
    typeof operation.reactionCommitted !== "boolean" ||
    operation.reactionOperationId !==
      linkedPotionOperationId(id, "reaction") ||
    operation.supplyOperationId !== linkedPotionOperationId(id, "supply") ||
    typeof operation.giver?.actorUuid !== "string" ||
    typeof operation.giver?.participantId !== "string" ||
    typeof operation.giver?.turnId !== "string" ||
    !operation.giver.actionReceipt ||
    typeof operation.giver.actionReceipt !== "object" ||
    Array.isArray(operation.giver.actionReceipt) ||
    typeof operation.recipient?.actorUuid !== "string" ||
    typeof operation.recipient?.participantId !== "string" ||
    typeof operation.recipient?.turnId !== "string" ||
    (operation.reactionCommitted &&
      (operation.recipient.reactionReceipt == null ||
        typeof operation.recipient.reactionReceipt !== "object" ||
        Array.isArray(operation.recipient.reactionReceipt))) ||
    (!operation.reactionCommitted &&
      operation.recipient.reactionReceipt != null) ||
    Object.hasOwn(operation.giver.actionReceipt, "turnId") ||
    (operation.recipient.reactionReceipt != null &&
      Object.hasOwn(operation.recipient.reactionReceipt, "turnId"))
  )
    throw new Error(
      "The durable potion operation changed or uses an unknown receipt shape.",
    );
  return operation;
}

async function potionReceipts(operation) {
  const recipient = await fromUuid(operation.recipient.actorUuid),
    giver = await fromUuid(operation.giver.actorUuid),
    recipientRecord = recipient?.getFlag(ID, "potionReceipts")?.[
      operation.requestId
    ],
    supplyRecord = giver?.getFlag(ID, "potionReceipts")?.[operation.requestId],
    supplyOperation = giver?.getFlag(ID, "potionSupplyOperations")?.[
      operation.supplyOperationId
    ];
  return {
    recipientActor: recipient,
    giverActor: giver,
    recipientReceipt: recipientRecord?.recipient ?? null,
    supplyReceipt: supplyRecord?.supply ?? null,
    supplyOperation: supplyOperation ?? null,
  };
}

function validateRecipientReceipt(receipt, operation) {
  if (
    receipt?.applied !== true ||
    receipt.kind !== "potion-recipient" ||
    receipt.parentId !== operation.requestId ||
    receipt.request !== operation.requestSignature ||
    receipt.actorUuid !== operation.recipient.actorUuid ||
    !same(receipt.before, operation.recipient.basis) ||
    !same(receipt.after, operation.plan.recipientSurvival)
  )
    throw new Error(
      "The potion recipient receipt changed; the DA must reconcile it without repeating healing.",
    );
}

function validateSupplyReceipt(receipt, operation, child = null) {
  if (
    receipt?.applied !== true ||
    receipt.kind !== "potion-supply" ||
    receipt.parentId !== operation.requestId ||
    receipt.operationId !== operation.supplyOperationId ||
    receipt.actorUuid !== operation.giver.actorUuid ||
    receipt.request !== operation.requestSignature
  )
    throw new Error(
      "The potion supply receipt changed; the DA must reconcile it without rerolling.",
    );
  if (child?.phase === "settled") {
    const validated = validateNativeSupplyRoll(child);
    if (
      !same(receipt.result, validated.result) ||
      !same(receipt.nativeRoll, child.nativeRoll) ||
      !same(receipt.recovery ?? null, child.recovery ?? null)
    )
      throw new Error(
        "The settled potion supply does not match its receipt. Do not reroll.",
      );
  } else if (
    child?.phase === "waived" &&
    !same(receipt.waiver, child.waiver)
  )
    throw new Error(
      "The waived potion supply does not match its receipt.",
    );
}

function assertPotionEncounterReceipts(combat, operation) {
  return validatePotionEncounterReceipts(
    operation,
    combat.getFlag(ID, "encounter"),
  );
}

async function commitRecipientReaction(combat, operation) {
  if (operation.plan.costs?.recipient?.reaction !== 1) return operation;
  if (operation.reactionCommitted) {
    assertPotionEncounterReceipts(combat, operation);
    return operation;
  }
  assertPotionEncounterReceipts(combat, operation);
  const state = combat.getFlag(ID, "encounter"),
    next = clone(state);
  next.budgets[operation.recipient.participantId] = clone(
    operation.plan.recipientTurn,
  );
  next.revision++;
  next.history.push({
    kind: "potion-reaction",
    operationId: operation.requestId,
    participantId: operation.recipient.participantId,
    reactionOperationId: operation.reactionOperationId,
    round: state.round,
    serial: state.serial,
  });
  const receipt =
    next.budgets[operation.recipient.participantId].operations?.[
      operation.reactionOperationId
    ];
  if (!receipt)
    throw new Error("The recipient Reaction produced no authoritative receipt.");
  const updated = clone({
    ...operation,
    recipient: {
      ...operation.recipient,
      reactionReceipt: receipt,
    },
    reactionCommitted: true,
    encounterRevisionAfter: next.revision,
  });
  validatePotionEncounterReceipts(updated, next);
  await writeAuthorityDocument(combat, {
    [`flags.${ID}.encounter`]: next,
    [`flags.${ID}.potionOperations.${operation.requestId}`]: updated,
    [`flags.${ID}.pendingPotion`]: operation.requestId,
  });
  return updated;
}

async function applyRecipientHealing(operation) {
  const recipient = await fromUuid(operation.recipient.actorUuid);
  assertWorldActor(recipient, "Potion recipient");
  assertBasisCurrent(recipient, operation.recipient.basis, "Potion recipient");
  const survival = clone(operation.plan.recipientSurvival);
  if (recipient.type === "character") validateSurvival(survival);
  const existing = clone(
      recipient.getFlag(ID, "potionReceipts")?.[
        operation.requestId
      ] ?? {},
    ),
    receipt = {
      applied: true,
      kind: "potion-recipient",
      parentId: operation.requestId,
      request: operation.requestSignature,
      authorId: operation.authorId,
      actorUuid: recipient.uuid,
      before: clone(operation.recipient.basis),
      healing: clone(operation.plan.healing),
      after: clone(survival),
    },
    changes = {
      "system.health.value": survival.hp,
      [`flags.${ID}.damageRevision`]: operation.recipient.basis.revision + 1,
      [`flags.${ID}.potionReceipts.${operation.requestId}`]: {
        ...existing,
        recipient: receipt,
      },
      [`flags.${ID}.operationReceipts.${operation.requestId}`]: {
        applied: true,
        kind: "potion-recipient",
        status: "applied",
        parentId: operation.requestId,
        actorUuid: recipient.uuid,
      },
    };
  if (recipient.type === "character")
    changes[`flags.${ID}.survival`] = survival;
  recipient.validate({
    changes: foundry.utils.expandObject(changes),
    strict: true,
    fallback: false,
  });
  await writeAuthorityDocument(recipient, changes);
  const saved = recipient.getFlag(ID, "potionReceipts")?.[
    operation.requestId
  ]?.recipient;
  validateRecipientReceipt(clone(saved), operation);
  if (
    recipient.system.health.value !== survival.hp ||
    (recipient.type === "character" &&
      !same(recipient.getFlag(ID, "survival"), survival))
  )
    throw new Error(
      "Potion healing needs reconciliation; do not apply it again.",
    );
}

async function assertRecipientReady(operation) {
  const recipient = await fromUuid(operation.recipient.actorUuid);
  assertWorldActor(recipient, "Potion recipient");
  assertBasisCurrent(recipient, operation.recipient.basis, "Potion recipient");
}

function currentBottleBasis(giver, operation) {
  const item = giver.items.get(operation.source.bottleItem.itemId);
  if (!item || item.uuid !== operation.source.bottleItem.itemUuid)
    throw new Error("The exact reserved healing bottle is no longer available.");
  if (item.system.catalogId !== operation.source.bottleItem.catalogId)
    throw new Error("The reserved Item now identifies as a different bottle.");
  return clone(inventoryBasis(giver, item));
}

async function assertSourceBeforeHealing(combat, operation) {
  const sourceItem = await fromUuid(operation.source.actionSourceItem.itemUuid),
    bottle = await fromUuid(operation.source.bottleItem.itemUuid),
    sourceCurrent =
      sourceItem?.uuid === operation.source.actionSourceItem.itemUuid &&
      sourceItem?.actor?.uuid === operation.giver.actorUuid &&
      sourceItem?.type ===
        (operation.source.actionSourceItem.type ?? sourceItem?.type),
    sourceSnapshot = sourceItem ? itemSourceSnapshot(sourceItem) : null;
  if (
    !sourceCurrent ||
    sourceSnapshot.catalogId !== operation.source.actionSourceItem.catalogId ||
    !same(sourceSnapshot.source, operation.source.actionSourceItem.source)
  )
    await markReconciliation(combat, operation, {
      stage: "before-healing",
      message:
        "The potion action or exact bottle source changed before healing. The DA must reconcile the declared use.",
      choices: ["cancel-remaining"],
      reserved: operation.source.actionSourceItem,
      current: sourceSnapshot,
    });
  if (
    !bottle ||
    bottle.uuid !== operation.source.bottleItem.itemUuid ||
    bottle.actor?.uuid !== operation.giver.actorUuid ||
    bottle.system?.catalogId !== operation.source.bottleItem.catalogId ||
    !same(
      bottle.getFlag(ID, "source") ?? null,
      operation.source.bottleItem.source,
    )
  )
    await markReconciliation(combat, operation, {
      stage: "before-healing",
      message:
        "The exact healing bottle source changed before healing. The DA must reconcile the declared use.",
      choices: ["cancel-remaining"],
      reserved: operation.source.bottleItem,
      current: bottle ? itemSourceSnapshot(bottle) : null,
    });
}

async function markReconciliation(combat, operation, issue) {
  const current = currentOperation(combat, operation.requestId) ?? operation,
    next = {
      ...current,
      status: "needs-reconciliation",
      reconciliation: {
        stage: issue.stage,
        message: issue.message,
        choices: issue.choices ?? ["waive-supply"],
        reserved: clone(issue.reserved ?? null),
        current: clone(issue.current ?? null),
      },
    };
  if (
    same(current.reconciliation, next.reconciliation) &&
    current.status === "needs-reconciliation"
  )
    throw new Error(issue.message);
  await writeAuthorityDocument(combat, {
    [`flags.${ID}.potionOperations.${operation.requestId}`]: next,
    [`flags.${ID}.pendingPotion`]: operation.requestId,
  });
  throw new Error(issue.message);
}

function supplyItemSnapshot(basis) {
  return clone({
    itemId: basis.item.itemId,
    itemUuid: basis.item.itemUuid,
    catalogId: basis.item.catalogId,
    inventoryDie: basis.item.inventoryDie,
    quantity: basis.item.quantity,
    source: basis.item.source,
  });
}

async function reserveAndRollSupply(combat, operation) {
  const giver = await fromUuid(operation.giver.actorUuid);
  assertWorldActor(giver, "Potion giver");
  if (giver.getFlag(ID, "pendingInventory"))
    throw new Error(
      "Finish the giver's separate pending supply check before continuing this potion.",
    );
  let current;
  try {
    current = currentBottleBasis(giver, operation);
  } catch (error) {
    await markReconciliation(combat, operation, {
      stage: "supply-reservation",
      message: `${error.message} The DA must close or reconcile this exact supply check.`,
      choices: ["waive-supply"],
      reserved: operation.bottleBasis,
      current: null,
    });
  }
  if (!sameBottleBasis(current, operation.bottleBasis))
    await markReconciliation(combat, operation, {
      stage: "supply-reservation",
      message:
        "The exact healing bottle or its supply changed after healing. The DA must reconcile the linked supply check.",
      choices: ["charge-current", "waive-supply"],
      reserved: operation.bottleBasis,
      current,
    });
  const target = supplyItemSnapshot(current),
    child = {
      schemaVersion: 1,
      operationId: operation.supplyOperationId,
      parentId: operation.requestId,
      actorUuid: giver.uuid,
      authorId: operation.authorId,
      phase: "rolling",
      basis: current,
      target,
    };
  // Persist ambiguity before evaluating dice. A retry in this phase never rerolls.
  await writeAuthorityDocument(giver, {
    [`flags.${ID}.potionSupplyOperations.${operation.supplyOperationId}`]: child,
  });
  const roll = await new foundry.dice.Roll(
      `1d${target.inventoryDie}`,
    ).evaluate({ allowInteractive: false }),
    retained = roll.dice[0]?.results?.find((result) => result.active)?.result;
  if (!Number.isSafeInteger(retained))
    throw new Error(
      "The potion supply roll saved no retained face. The DA must recover it explicitly.",
    );
  const result = inventoryCheck({
      die: target.inventoryDie,
      retained,
    }),
    saved = clone({
      ...child,
      phase: "rolled",
      retainedFace: retained,
      result,
      nativeRoll: roll.toJSON(),
    });
  await writeAuthorityDocument(giver, {
    [`flags.${ID}.potionSupplyOperations.${operation.supplyOperationId}`]: saved,
  });
}

function rollFromJson(data) {
  return data ? foundry.dice.Roll.fromData(clone(data)) : null;
}

function validateNativeSupplyRoll(record) {
  const target = record?.target,
    retained = record?.retainedFace;
  if (
    !target ||
    !Number.isSafeInteger(target.inventoryDie) ||
    ![4, 6, 8, 10, 12, 20].includes(target.inventoryDie) ||
    !Number.isSafeInteger(retained) ||
    retained < 1 ||
    retained > target.inventoryDie
  )
    throw new Error("The saved potion supply result is invalid. Do not reroll.");
  const checked = inventoryCheck({
    die: target.inventoryDie,
    retained,
  });
  if (!same(checked, record.result))
    throw new Error(
      "The potion supply result is inconsistent. The DA must recover it explicitly.",
    );
  if (record.nativeRoll === null) {
    if (
      !record.recovery?.authorId ||
      (record.recovery.reason !== undefined &&
        typeof record.recovery.reason !== "string")
    )
      throw new Error(
        "The missing potion supply face has no DA recovery record. Do not reroll.",
      );
    return { roll: null, result: checked };
  }
  let roll;
  try {
    roll = rollFromJson(record.nativeRoll);
  } catch {
    roll = null;
  }
  const die = roll?.dice?.[0],
    active = die?.results?.filter((result) => result.active) ?? [];
  if (
    !roll ||
    record.nativeRoll?.evaluated !== true ||
    roll.formula?.replace(/\s+/g, "").toLowerCase() !==
      `1d${target.inventoryDie}` ||
    die?.faces !== target.inventoryDie ||
    die.number !== 1 ||
    active.length !== 1 ||
    active[0].result !== retained ||
    roll.total !== retained
  )
    throw new Error(
      "The saved potion supply dice do not match its result. The DA must review it.",
    );
  return { roll, result: checked };
}

async function settleSupply(combat, operation, child) {
  const validated = validateNativeSupplyRoll(child),
    giver = await fromUuid(operation.giver.actorUuid);
  assertWorldActor(giver, "Potion giver");
  let current;
  try {
    current = currentBottleBasis(giver, operation);
  } catch (error) {
    await markReconciliation(combat, operation, {
      stage: "supply-settlement",
      message: `${error.message} The DA must reconcile the saved supply result.`,
      choices: ["waive-supply"],
      reserved: child.basis,
      current: null,
    });
  }
  const chargedAfterReview =
    operation.reconciliation?.disposition?.choice === "charge-current" &&
    sameBottleBasis(current, operation.bottleBasis);
  if (!chargedAfterReview && !sameBottleBasis(current, child.basis))
    await markReconciliation(combat, operation, {
      stage: "supply-settlement",
      message:
        "The exact healing bottle changed after its supply roll. The DA must choose how to reconcile the linked roll.",
      choices: ["charge-current", "waive-supply"],
      reserved: child.basis,
      current,
    });
  const beforeItems = clone(giver.toObject().items ?? []),
    items = clone(beforeItems),
    matches = items.filter(
      (item) => item._id === operation.source.bottleItem.itemId,
    );
  if (
    matches.length !== 1 ||
    matches[0].type !== "equipment" ||
    matches[0].system.quantity !== child.target.quantity ||
    matches[0].system.inventoryDie !== child.target.inventoryDie
  )
    await markReconciliation(combat, operation, {
      stage: "supply-settlement",
      message:
        "The exact healing bottle changed after its supply roll. The DA must reconcile it without charging a different bottle.",
      choices: ["charge-current", "waive-supply"],
      reserved: child.basis,
      current,
    });
  matches[0].system.inventoryDie = validated.result.after;
  validateEmbeddedItems(giver, items);
  const existing = clone(
      giver.getFlag(ID, "potionReceipts")?.[
        operation.requestId
      ] ?? {},
    ),
    revision = giver.getFlag(ID, "inventoryRevision") ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw new Error("The giver's inventory revision is invalid.");
  const settled = clone({
      ...child,
      phase: "settled",
      settledAt: Date.now(),
    }),
    receipt = {
      applied: true,
      kind: "potion-supply",
      parentId: operation.requestId,
      operationId: operation.supplyOperationId,
      actorUuid: giver.uuid,
      authorId: operation.authorId,
      request: operation.requestSignature,
      result: validated.result,
      nativeRoll: clone(child.nativeRoll),
      recovery: clone(child.recovery ?? null),
    },
    changes = {
      items,
      [`flags.${ID}.inventoryRevision`]: revision + 1,
      [`flags.${ID}.potionSupplyOperations.${operation.supplyOperationId}`]:
        settled,
      [`flags.${ID}.potionReceipts.${operation.requestId}`]: {
        ...existing,
        supply: receipt,
      },
      [`flags.${ID}.operationReceipts.${operation.supplyOperationId}`]: {
        applied: true,
        kind: "potion-supply",
        status: "settled",
        parentId: operation.requestId,
      },
    };
  giver.validate({
    changes: foundry.utils.expandObject(changes),
    strict: true,
    fallback: false,
  });
  await writeAuthorityDocument(giver, changes);
  const saved = giver.getFlag(ID, "potionReceipts")?.[
    operation.requestId
  ]?.supply;
  validateSupplyReceipt(clone(saved), operation);
  if (
    giver.items.get(operation.source.bottleItem.itemId)?.system.inventoryDie !==
    validated.result.after
  )
    throw new Error(
      "Potion supply needs reconciliation; do not repeat its roll or use.",
    );
  verifyPotionSupplyItems(
    giver.toObject().items ?? [],
    beforeItems,
    operation.source.bottleItem.itemId,
    validated.result.after,
  );
  return { giver, receipt };
}

function settlementReceipt(operation, status = "complete") {
  return {
    applied: true,
    kind: "potion",
    status,
    authorId: operation.authorId,
    request: operation.requestSignature,
    recipientActorUuid: operation.recipient.actorUuid,
    giverActorUuid: operation.giver.actorUuid,
    recipientReceiptId: operation.requestId,
    supplyReceiptId: operation.supplyOperationId,
  };
}

function validateSettlementReceipt(receipt, operation) {
  if (
    receipt?.applied !== true ||
    receipt.kind !== "potion" ||
    receipt.status !== operation.status ||
    receipt.authorId !== operation.authorId ||
    receipt.request !== operation.requestSignature ||
    receipt.recipientActorUuid !== operation.recipient.actorUuid ||
    receipt.giverActorUuid !== operation.giver.actorUuid
  )
    throw new Error(
      "The completed potion settlement changed; do not repeat its costs or healing.",
    );
}

async function restoreUnusedRecipientReaction(combat, operation, detail) {
  if (
    !operation.reactionCommitted ||
    operation.plan.costs?.recipient?.reaction !== 1
  )
    return operation;
  const recipient = await fromUuid(operation.recipient.actorUuid);
  if (
    recipient?.getFlag(ID, "potionReceipts")?.[operation.requestId]
      ?.recipient?.applied
  )
    return operation;
  const state = combat.getFlag(ID, "encounter");
  if (
    !state ||
    state.revision !== operation.encounterRevisionAfter ||
    !same(
      state.budgets?.[operation.recipient.participantId],
      operation.plan.recipientTurn,
    )
  )
    throw new Error(
      "The unused recipient Reaction cannot be restored without DA reconciliation.",
    );
  const next = clone(state);
  next.budgets[operation.recipient.participantId] = clone(
    operation.budgets.before.recipient,
  );
  next.revision++;
  next.history.push({
    kind: "potion-reaction-cancelled",
    operationId: operation.requestId,
    participantId: operation.recipient.participantId,
    reactionOperationId: operation.reactionOperationId,
    reason: detail.reason,
    userId: detail.userId,
    round: state.round,
    serial: state.serial,
  });
  const updated = clone({
    ...operation,
    recipient: {
      ...operation.recipient,
      reactionReceipt: null,
    },
    reactionCommitted: false,
    reactionCancellation: clone(detail),
    encounterRevisionAfter: next.revision,
  });
  validatePotionEncounterReceipts(updated, next);
  await writeAuthorityDocument(combat, {
    [`flags.${ID}.encounter`]: next,
    [`flags.${ID}.potionOperations.${operation.requestId}`]: updated,
  });
  return updated;
}

async function settleCombat(combat, operation, status = "complete") {
  const latest = currentOperation(combat, operation.requestId) ?? operation,
    next = clone({ ...latest, status, completedAt: Date.now() });
  await writeAuthorityDocument(combat, {
    [`flags.${ID}.potionOperations.${operation.requestId}`]: next,
    [`flags.${ID}.pendingPotion`]: null,
    [`flags.${ID}.operationReceipts.${operation.requestId}`]:
      settlementReceipt(next, status),
  });
  return next;
}

async function presentPotionResult(combat, operation, message) {
  const latest = currentOperation(combat, operation.requestId) ?? operation,
    { recipientActor, giverActor } = await potionReceipts(latest),
    recipientReceipt = recipientActor?.getFlag(ID, "potionReceipts")?.[
      latest.requestId
    ]?.recipient,
    supplyReceipt = giverActor?.getFlag(ID, "potionReceipts")?.[
      latest.requestId
    ]?.supply,
    supplyOperation = giverActor?.getFlag(ID, "potionSupplyOperations")?.[
      latest.supplyOperationId
    ];
  if (!message) return;
  let content, rolls = [];
  if (latest.status === "interrupted") {
    const reconciliation =
      latest.reconciliation?.disposition?.choice === "cancel-remaining";
    content = reconciliation
      ? `${escaped(latest.bottleBasis.item.name)} was cancelled before healing after a source reconciliation. No healing or supply check occurred; already declared action costs remain spent.${latest.reconciliation.disposition.reason ? ` Note: ${escaped(latest.reconciliation.disposition.reason)}.` : ""}`
      : `${escaped(latest.bottleBasis.item.name)} use interrupted before healing. One Maneuver remains spent; no Reaction, healing or supply check occurred.`;
  } else {
    const healing = recipientReceipt?.healing ?? latest.plan.healing,
      supply = supplyReceipt?.result,
      reaction = latest.plan.costs.recipient.reaction
        ? "recipient Reaction spent"
        : latest.recipient.basis.hp === 0
          ? "recipient at 0 HP pays no Reaction"
          : "self use requires no recipient Reaction";
    content = `${escaped(latest.bottleBasis.item.name)}: ${escaped(latest.giver.basis.actorName)} restored ${healing.restored} HP to ${escaped(latest.recipient.basis.actorName)} after Life resistance ${healing.resistance}; HP ${latest.recipient.basis.hp} → ${recipientReceipt?.after?.hp ?? latest.plan.recipientSurvival.hp}. One giver Maneuver spent; ${reaction}. Supply d${supply?.before ?? latest.plan.inventory.die} → ${supply ? (supply.after ? `d${supply.after}` : "out") : "reconciled"}; the check occurred after healing.`;
    if (supplyOperation?.nativeRoll) {
      const roll = rollFromJson(supplyOperation.nativeRoll);
      if (roll) rolls = [roll];
    } else if (supplyReceipt?.recovery)
      content += " The DA recovered the observed supply face without rerolling.";
    if (latest.status === "reconciled-without-supply")
      content += ` The DA reconciled the remaining supply without charging a different bottle.${latest.reconciliation?.disposition?.reason ? ` Note: ${escaped(latest.reconciliation.disposition.reason)}.` : ""}`;
    else if (
      latest.reconciliation?.disposition?.choice === "charge-current"
    )
      content += ` The DA retained the exact bottle after source review.${latest.reconciliation.disposition.reason ? ` Note: ${escaped(latest.reconciliation.disposition.reason)}.` : ""}`;
  }
  await message
    .update({
      content,
      ...(rolls.length ? { rolls } : {}),
      [`flags.${ID}.potionResult`]: clone({
        operation: latest,
        recipientReceipt: recipientReceipt ?? null,
        supplyReceipt: supplyReceipt ?? null,
        supplyOperation: supplyOperation ?? null,
      }),
    })
    .catch(() => {});
}

async function advancePotionOperation(combat, initialOperation, message) {
  let operation = clone(initialOperation);
  for (let step = 0; step < 8; step++) {
    validateStoredPotionOperation(operation, operation.requestId, combat);
    const {
        recipientActor,
        giverActor,
        recipientReceipt,
        supplyReceipt,
        supplyOperation,
      } = await potionReceipts(operation),
      settlement = combat.getFlag(ID, "operationReceipts")?.[
        operation.requestId
      ],
      phase = potionOperationNextPhase({
        operation,
        recipientReceipt,
        supplyOperation,
        settlement,
      });
    if (!settlement?.applied)
      assertPotionEncounterReceipts(combat, operation);
    if (recipientReceipt) validateRecipientReceipt(recipientReceipt, operation);
    if (supplyReceipt && !supplyOperation)
      throw new Error(
        "The potion supply receipt has no linked child operation. Do not repeat the roll.",
      );
    if (supplyReceipt)
      validateSupplyReceipt(supplyReceipt, operation, supplyOperation);
    if (
      ["settled", "waived"].includes(supplyOperation?.phase) &&
      !supplyReceipt
    )
      throw new Error(
        "The linked potion supply finished without its Actor receipt. Reconcile it before settlement.",
      );
    if (
      phase === "complete" &&
      operation.status !== "interrupted" &&
      (!recipientReceipt || !supplyReceipt)
    )
      throw new Error(
        "The settled potion operation is missing an Actor receipt. Reconcile it without repeating costs or healing.",
      );
    switch (phase) {
      case "complete":
        validateSettlementReceipt(settlement, operation);
        await presentPotionResult(combat, operation, message);
        return { status: operation.status, replay: true };
      case "reconcile":
        throw new Error(
          operation.reconciliation?.message ??
            "The potion operation needs DA reconciliation.",
        );
      case "settle-interrupted":
        operation = await settleCombat(combat, operation, "interrupted");
        await presentPotionResult(combat, operation, message);
        return { status: "interrupted", replay: false };
      case "heal-recipient":
        await assertSourceBeforeHealing(combat, operation);
        try {
          await assertRecipientReady(operation);
        } catch (error) {
          await markReconciliation(combat, operation, {
            stage: "before-healing",
            message: `${error.message} The DA must reconcile the declared potion use.`,
            choices: ["cancel-remaining"],
            reserved: operation.recipient.basis,
            current: null,
          });
        }
        operation = await commitRecipientReaction(combat, operation);
        await applyRecipientHealing(operation);
        break;
      case "reserve-supply":
        await reserveAndRollSupply(combat, operation);
        break;
      case "recover-supply":
        throw new Error(
          "The potion supply may have rolled without a saved face. The DA must record the observed result explicitly; retry will not reroll.",
        );
      case "settle-supply":
        await settleSupply(combat, operation, supplyOperation);
        break;
      case "settle-operation":
        operation = await settleCombat(
          combat,
          operation,
          operation.finalStatus ?? "complete",
        );
        await presentPotionResult(combat, operation, message);
        return { status: operation.status, replay: false };
      default:
        throw new Error("Unknown potion continuation phase.");
    }
    const latest = currentOperation(combat, operation.requestId);
    if (latest) operation = latest;
  }
  throw new Error("Potion continuation exceeded its durable phase limit.");
}

export function findPotionCombat(requestId) {
  return (
    game.combats.find(
      (combat) =>
        combat.getFlag(ID, "pendingPotion") === requestId ||
        combat.getFlag(ID, "potionOperations")?.[requestId],
    ) ?? null
  );
}

export function resolvePotionRequest(id, combatUuid = null) {
  const request =
      game.messages.get(id)?.getFlag(ID, "potionRequest") ??
      findPotionCombat(id)?.getFlag(ID, "potionOperations")?.[id]
        ?.requestSnapshot,
    targetUuid =
      combatUuid ?? request?.combatUuid ?? findPotionCombat(id)?.uuid ?? null;
  return enqueueCharacterOperation(() => applyPotionRequest(id, targetUuid), {
    requestId: id,
    targetUuid: typeof targetUuid === "string" ? targetUuid : null,
  });
}

async function applyPotionRequest(id, combatUuid = null) {
  const message = game.messages.get(id),
    requestFromMessage = message?.getFlag(ID, "potionRequest"),
    combat = await fromUuid(
      combatUuid ?? requestFromMessage?.combatUuid ?? "",
    );
  let operation = combat?.documentName === "Combat"
    ? currentOperation(combat, id)
    : null;
  if (operation) {
    validateStoredPotionOperation(operation, id, combat);
    if (message && !requestFromMessage)
      throw new Error("The reserved potion request changed.");
    if (
      requestFromMessage &&
      JSON.stringify(requestFromMessage) !== operation.requestSignature
    )
      throw new Error("The reserved potion request was changed.");
    if (message?.author && message.author.id !== operation.authorId)
      throw new Error("The original potion request author changed.");
  } else {
    if (!message?.author || !requestFromMessage)
      throw new Error("The original potion request is unavailable.");
    ({ operation } = await createOperation(message, requestFromMessage));
  }
  if (
    operation.status !== "interrupted" &&
    !combat.getFlag(ID, "operationReceipts")?.[id]?.applied &&
    combat.getFlag(ID, "pendingPotion") !== id
  )
    throw new Error("This potion operation is not the pending encounter action.");
  return advancePotionOperation(combat, operation, message);
}

export function recoverPotionSupplyOperation(
  requestId,
  retainedFace,
  daReason,
) {
  const combatUuid = findPotionCombat(requestId)?.uuid ?? null;
  return enqueueCharacterOperation(
    () =>
      recoverPotionSupplyDirect(requestId, retainedFace, daReason, game.user),
    { requestId, targetUuid: combatUuid },
  );
}

async function recoverPotionSupplyDirect(
  requestId,
  retainedFace,
  daReason,
  user,
) {
  if (!user.isGM)
    throw new Error("Only the DA can recover an unknown potion supply face.");
  const combat = findPotionCombat(requestId),
    operation = combat ? currentOperation(combat, requestId) : null;
  if (!combat || !operation)
    throw new Error("The pending potion operation is unavailable.");
  if (combat.getFlag(ID, "pendingPotion") !== requestId)
    throw new Error("This potion operation is no longer pending.");
  const giver = await fromUuid(operation.giver.actorUuid),
    child = giver?.getFlag(ID, "potionSupplyOperations")?.[
      operation.supplyOperationId
    ];
  if (!child || child.phase !== "rolling")
    throw new Error("This supply check has no unknown dice to recover.");
  const result = inventoryCheck({
      die: child.target.inventoryDie,
      retained: retainedFace,
    }),
    saved = clone({
      ...child,
      phase: "rolled",
      retainedFace: result.retained,
      result,
      nativeRoll: null,
      recovery: {
        authorId: user.id,
        reason: potionNote(daReason),
      },
    });
  await writeAuthorityDocument(giver, {
    [`flags.${ID}.potionSupplyOperations.${operation.supplyOperationId}`]: saved,
  });
  const message = game.messages.get(requestId) ?? null;
  return advancePotionOperation(combat, operation, message);
}

export function reconcilePotionOperation(
  requestId,
  choice,
  daReason,
) {
  const combatUuid = findPotionCombat(requestId)?.uuid ?? null;
  return enqueueCharacterOperation(
    () => reconcilePotionDirect(requestId, choice, daReason, game.user),
    { requestId, targetUuid: combatUuid },
  );
}

async function reconcilePotionDirect(requestId, choice, daReason, user) {
  if (!user.isGM)
    throw new Error("Only the DA can reconcile a changed potion source.");
  if (
    !["charge-current", "waive-supply", "cancel-remaining"].includes(choice)
  )
    throw new Error("Choose a potion reconciliation disposition.");
  const combat = findPotionCombat(requestId),
    operation = combat ? currentOperation(combat, requestId) : null;
  if (
    !combat ||
    !operation ||
    operation.status !== "needs-reconciliation" ||
    combat.getFlag(ID, "pendingPotion") !== requestId
  )
    throw new Error("This potion operation is not awaiting reconciliation.");
  if (!operation.reconciliation?.choices?.includes(choice))
    throw new Error("That reconciliation choice is unavailable.");
  const note = potionNote(daReason),
    giver = await fromUuid(operation.giver.actorUuid);
  assertWorldActor(giver, "Potion giver");
  if (choice !== "cancel-remaining") {
    const recipient = await fromUuid(operation.recipient.actorUuid),
      recipientReceipt =
        recipient?.getFlag(ID, "potionReceipts")?.[requestId]?.recipient;
    if (!recipientReceipt)
      throw new Error(
        "The potion supply cannot settle before its recipient healing receipt.",
      );
    validateRecipientReceipt(recipientReceipt, operation);
    assertPotionEncounterReceipts(combat, operation);
  }
  if (choice === "cancel-remaining") {
    const recipient = await fromUuid(operation.recipient.actorUuid);
    if (
      recipient?.getFlag(ID, "potionReceipts")?.[requestId]
        ?.recipient?.applied
    )
      throw new Error(
        "Potions cannot cancel after healing; resume the saved supply phase.",
      );
    const restored = await restoreUnusedRecipientReaction(
        combat,
        operation,
        {
          choice,
          userId: user.id,
          reason: note,
          at: Date.now(),
        },
      ),
      updated = clone({
        ...restored,
        reconciliation: {
          ...restored.reconciliation,
          disposition: {
            choice,
            userId: user.id,
            reason: note,
            at: Date.now(),
          },
        },
      });
    await writeAuthorityDocument(combat, {
      [`flags.${ID}.potionOperations.${requestId}`]: updated,
    });
    const settled = await settleCombat(combat, updated, "interrupted");
    await presentPotionResult(
      combat,
      settled,
      game.messages.get(requestId) ?? null,
    );
    return { status: "interrupted", replay: false };
  }
  if (choice === "charge-current") {
    const item = giver.items.get(operation.source.bottleItem.itemId);
    if (
      !item ||
      item.uuid !== operation.source.bottleItem.itemUuid ||
      item.system.catalogId !== operation.source.bottleItem.catalogId
    )
      throw new Error(
        "The exact original bottle is unavailable. Close the supply check without charging a different bottle.",
      );
    const current = clone(inventoryBasis(giver, item)),
      child = giver.getFlag(ID, "potionSupplyOperations")?.[
        operation.supplyOperationId
      ];
    if (
      child &&
      (child.target.inventoryDie !== current.item.inventoryDie ||
        child.target.quantity !== current.item.quantity)
    )
      throw new Error(
        "The saved supply roll belongs to a different die or quantity. Close the remaining check without charging the changed bottle.",
      );
    const updated = clone({
        ...operation,
        status: "reserved",
        finalStatus: null,
        bottleBasis: current,
        reconciliation: {
          ...operation.reconciliation,
          disposition: {
            choice,
            userId: user.id,
            reason: note,
            at: Date.now(),
          },
        },
      });
    await writeAuthorityDocument(combat, {
      [`flags.${ID}.potionOperations.${requestId}`]: updated,
    });
    return advancePotionOperation(
      combat,
      updated,
      game.messages.get(requestId) ?? null,
    );
  }
  const existingChild =
    giver.getFlag(ID, "potionSupplyOperations")?.[
      operation.supplyOperationId
    ];
  if (existingChild?.phase === "waived") {
    const existingReceipt =
      giver.getFlag(ID, "potionReceipts")?.[requestId]?.supply;
    validateSupplyReceipt(existingReceipt, operation, existingChild);
  } else {
    if (
      existingChild &&
      !["rolling", "rolled"].includes(existingChild.phase)
    )
      throw new Error(
        "The saved potion supply phase cannot be waived in its current state.",
      );
    const child = existingChild
        ? clone(existingChild)
        : {
            schemaVersion: 1,
            operationId: operation.supplyOperationId,
            parentId: requestId,
            actorUuid: giver.uuid,
            authorId: operation.authorId,
            basis: operation.bottleBasis,
            target: supplyItemSnapshot(operation.bottleBasis),
          },
      waived = clone({
        ...child,
        phase: "waived",
        waivedFromPhase: child.phase,
        waiver: {
          userId: user.id,
          reason: note,
          at: Date.now(),
        },
      }),
      existing = clone(
        giver.getFlag(ID, "potionReceipts")?.[requestId] ?? {},
      ),
      receipt = {
        applied: true,
        kind: "potion-supply",
        status: "waived",
        parentId: requestId,
        operationId: operation.supplyOperationId,
        actorUuid: giver.uuid,
        authorId: operation.authorId,
        request: operation.requestSignature,
        waiver: waived.waiver,
      },
      changes = {
        [`flags.${ID}.potionSupplyOperations.${operation.supplyOperationId}`]:
          waived,
        [`flags.${ID}.potionReceipts.${requestId}`]: {
          ...existing,
          supply: receipt,
        },
        [`flags.${ID}.operationReceipts.${operation.supplyOperationId}`]: {
          applied: true,
          kind: "potion-supply",
          status: "waived",
          parentId: requestId,
        },
      };
    await writeAuthorityDocument(giver, changes);
    validateSupplyReceipt(receipt, operation, waived);
  }
  const updated = clone({
    ...operation,
    status: "reserved",
    finalStatus: "reconciled-without-supply",
    reconciliation: {
      ...operation.reconciliation,
      disposition: {
        choice,
        userId: user.id,
        reason: note,
        at: Date.now(),
      },
    },
  });
  await writeAuthorityDocument(combat, {
    [`flags.${ID}.potionOperations.${requestId}`]: updated,
  });
  const settled = await settleCombat(
    combat,
    updated,
    "reconciled-without-supply",
  );
  await presentPotionResult(
    combat,
    settled,
    game.messages.get(requestId) ?? null,
  );
  return { status: "reconciled-without-supply", replay: false };
}

export function renderPotionProposal(message, element) {
  const proposal = message.getFlag(ID, "potionProposal");
  if (
    !proposal ||
    !message.isContentVisible ||
    element.querySelector(".hol-potion-consent")
  )
    return;
  const recipient = fromUuidSync(proposal.recipientActorUuid),
    canAccept = recipient?.testUserPermission(game.user, "OWNER"),
    card = element.querySelector(".hol-potion-proposal");
  if (!card || (!canAccept && !game.user.isGM)) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "hol-potion-consent";
  button.textContent = canAccept
    ? "Confirm as willing recipient"
    : "DA adjudicate and confirm";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      let daReason = "";
      if (!canAccept) {
        const result = await foundry.applications.api.DialogV2.input({
          window: { title: "Adjudicate recipient willingness" },
          content:
            '<label>Optional note<input name="reason"></label>',
          ok: { label: "Record ruling and confirm" },
        });
        if (!result) return;
        daReason = result.reason;
      }
      await acceptPotionProposal(message.id, { daReason, daWillingness: !canAccept });
      ui.notifications.info("Potion recipient consent recorded.");
    } catch (error) {
      ui.notifications.error(error.message);
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  });
  card.append(button);
}

export function registerPotionRequests() {
  Hooks.on("createChatMessage", (message) => {
    if (message.getFlag(ID, "potionRequest") && isCreationAuthority())
      resolvePotionRequest(message.id).catch((error) => {
        ui.notifications.error(error.message);
        message
          .update({
            content: `Potion use needs attention: ${escaped(error.message)}`,
          })
          .catch(() => {});
      });
  });
}
