import { continueAction, declareAction } from "../rules/actions.mjs";
import { isMeleeWeaponEquipment } from "../rules/equipment-identity.mjs";
import { classifyRoll } from "../rules/roll.mjs";
import {
  actorTokenMatchesParticipant,
  basicMeleeDamage,
  validateActionReceipt,
  basicMeleeRequestMatches,
  nearestAccessibleLine,
  nativeBasicMeleeGeometry,
  targetVisibleToRequester,
  woundApplicabilityMatches,
} from "../rules/player-attacks.mjs";
import { itemAbilityDefinition } from "./abilities.mjs";
import {
  enqueueCharacterOperation,
  isCreationAuthority,
  writeAuthorityDocument,
} from "./authority.mjs";
import { actionConditions } from "./turn-budget.mjs";
import {
  prepareRoll,
  rollBasis,
} from "./roll-preparation.mjs";
import { evaluatePreparedRoll } from "./roll.mjs";

const ID = "heroes-of-legend";
const HANDLER = "player-basic-melee-v1";
const SOURCE_ID = "ability-basic-melee";

function definitionFor(item) {
  const definition = item?.type === "ability" ? itemAbilityDefinition(item) : null;
  if (definition?.handler !== HANDLER)
    throw new Error("This ability does not use the reviewed Basic Melee handler.");
  return definition;
}

function exactActorToken(actor) {
  const candidates = [];
  const add = (token) => {
    if (
      token?.documentName === "Token" &&
      token.actor?.uuid === actor.uuid &&
      !candidates.some((candidate) => candidate.uuid === token.uuid)
    )
      candidates.push(token);
  };
  add(actor.token);
  for (const placeable of canvas?.tokens?.controlled ?? [])
    add(placeable.document);
  if (actor.parent?.documentName === "Scene")
    for (const token of actor.parent.tokens)
      if (token.actorLink && token.actor?.uuid === actor.uuid) add(token);
  if (candidates.length !== 1)
    throw new Error(
      "Control exactly one token for the acting character before preparing Basic Melee.",
    );
  return candidates[0];
}

export function heldMeleeWeapons(actor) {
  return actor.items
    .filter(
      (item) =>
        isMeleeWeaponEquipment(item) &&
        item.system.held,
    )
    .sort((a, b) => a.uuid.localeCompare(b.uuid));
}

function sceneTokens(actorToken) {
  const scene = actorToken?.parent;
  return scene?.documentName === "Scene" ? [...scene.tokens] : [];
}

function targetOptions(actorToken, actor, requester = game.user) {
  return sceneTokens(actorToken)
    .filter(
      (token) =>
        token.uuid !== actorToken.uuid &&
        token.actor?.uuid !== actor.uuid &&
        ["character", "creature"].includes(token.actor?.type) &&
        targetVisibleToRequester(token, requester),
    )
    .sort((a, b) => a.name.localeCompare(b.name) || a.uuid.localeCompare(b.uuid))
    .map((token) => ({
      uuid: token.uuid,
      name: token.name,
      actorUuid: token.actor.uuid,
      actorType: token.actor.type,
    }));
}

function tokenLevel(token) {
  return token?.level ?? token?._source?.level ?? null;
}

function occupiedSquareCenters(token) {
  const offsets = token.getOccupiedGridSpaceOffsets?.();
  if (!Array.isArray(offsets) || !offsets.length)
    throw new Error("Native occupied squares are unavailable.");
  const centers = offsets.map((offset) => {
    const center = canvas.grid.getCenterPoint({
      i: offset.i,
      j: offset.j,
    });
    if (!Number.isFinite(center?.x) || !Number.isFinite(center?.y))
      throw new Error("Native occupied-square centers are unavailable.");
    return {
      x: center.x,
      y: center.y,
      elevation: Number(token.elevation ?? 0),
    };
  });
  if (!centers.length)
    throw new Error("Native occupied squares are unavailable.");
  return centers;
}

function collisionAccessible(origin, destination) {
  const backend = CONFIG.Canvas.polygonBackends?.move;
  if (typeof backend?.testCollision !== "function") return null;
  try {
    return (
      backend.testCollision(origin, destination, {
        type: "move",
        mode: "any",
      }) === false
    );
  } catch {
    return null;
  }
}

function nearestAttackLine(actorToken, targetToken) {
  const origins = occupiedSquareCenters(actorToken),
    destinations = occupiedSquareCenters(targetToken),
    candidates = [];
  for (const origin of origins)
    for (const destination of destinations) {
      const measurement = canvas.grid.measurePath([origin, destination]),
        spaces = measurement?.spaces;
      if (
        Number.isFinite(spaces) &&
        spaces >= 0
      )
        candidates.push({ spaces, origin, destination });
    }
  return nearestAccessibleLine(candidates, collisionAccessible);
}

export function nativeBasicMeleeAdjacency(actorToken, targetToken) {
  if (
    actorToken?.documentName !== "Token" ||
    targetToken?.documentName !== "Token"
  )
    throw new Error("Basic Melee needs exact acting and target tokens.");
  if (
    actorToken.parent?.uuid !== targetToken.parent?.uuid ||
    !actorToken.parent
  )
    return nativeBasicMeleeGeometry({
      actorTokenUuid: actorToken.uuid,
      targetTokenUuid: targetToken.uuid,
      sceneUuid: actorToken.parent?.uuid ?? null,
      spaces: null,
      accessible: false,
    });
  let distance = null,
    accessible = null;
  if (
    canvas?.ready &&
    canvas.scene?.uuid === actorToken.parent.uuid &&
    canvas.grid?.measurePath
  ) {
    try {
      const squareGrid =
          canvas.grid?.isSquare === true ||
          actorToken.parent.grid?.type === CONST.GRID_TYPES.SQUARE,
        actorLevel = tokenLevel(actorToken),
        targetLevel = tokenLevel(targetToken),
        activeLevel = canvas.level?.id ?? null,
        actorElevation = Number(actorToken.elevation ?? 0),
        targetElevation = Number(targetToken.elevation ?? 0);
      if (!squareGrid)
        throw new Error("Basic Melee native geometry requires a square grid.");
      if (
        actorLevel &&
        targetLevel &&
        actorLevel !== targetLevel
      )
        return nativeBasicMeleeGeometry({
          actorTokenUuid: actorToken.uuid,
          targetTokenUuid: targetToken.uuid,
          sceneUuid: actorToken.parent.uuid,
          spaces: null,
          accessible: null,
          actorLevel,
          targetLevel,
          actorElevation,
          targetElevation,
        });
      if (activeLevel && actorLevel && activeLevel !== actorLevel)
        throw new Error(
          "The active Canvas level does not match the acting token.",
        );
      const line = nearestAttackLine(actorToken, targetToken);
      distance = line.spaces;
      accessible = line.accessible;
      return nativeBasicMeleeGeometry({
        actorTokenUuid: actorToken.uuid,
        targetTokenUuid: targetToken.uuid,
        sceneUuid: actorToken.parent.uuid,
        spaces: distance,
        accessible,
        actorLevel,
        targetLevel,
        actorElevation,
        targetElevation,
        collision:
          accessible === true
            ? "clear"
            : accessible === false
              ? "blocked"
              : "unverified",
      });
    } catch {
      distance = null;
      accessible = null;
    }
  }
  return nativeBasicMeleeGeometry({
    actorTokenUuid: actorToken.uuid,
    targetTokenUuid: targetToken.uuid,
    sceneUuid: actorToken.parent.uuid,
    spaces: distance,
    accessible,
    actorLevel: tokenLevel(actorToken),
    targetLevel: tokenLevel(targetToken),
    actorElevation: Number(actorToken.elevation ?? 0),
    targetElevation: Number(targetToken.elevation ?? 0),
  });
}

function actionPreview(actor, combat, participantId, operationId, ruling) {
  const state = combat.getFlag(ID, "encounter"),
    budget = state?.budgets?.[participantId];
  if (!state || !budget)
    throw new Error("This character has no active encounter turn.");
  const declared = declareAction(budget, {
    operationId,
    sourceId: SOURCE_ID,
    category: "main",
    conditions: actionConditions(actor),
    ownTurn: state.current === participantId,
    ...(ruling ? { override: ruling } : {}),
  });
  return { state, budget, declared };
}

function buildBasis({
  actor,
  actorToken,
  targetToken,
  item,
  definition,
  weapon,
  combat,
  participantId,
  encounterRevision,
}) {
  if (actor?.type !== "character")
    throw new Error(
      "This is the player-character Basic Melee handler; player-controlled creatures use a future handler.",
    );
  if (!Number.isSafeInteger(encounterRevision) || encounterRevision < 0)
    throw new Error("Basic Melee needs the encounter revision.");
  if (
    !weapon ||
    weapon.actor?.uuid !== actor.uuid ||
    !isMeleeWeaponEquipment(weapon) ||
    weapon.system.held !== true
  )
    throw new Error("Hold a compatible melee weapon before making Basic Melee.");
  const target = targetToken?.actor;
  if (
    !target ||
    !["character", "creature"].includes(target.type) ||
    targetToken.uuid === actorToken.uuid ||
    !targetVisibleToRequester(targetToken, game.user)
  )
    throw new Error(
      "Choose one other visible or available character or creature as the target.",
    );
  const geometry = nativeBasicMeleeAdjacency(actorToken, targetToken),
    roll = rollBasis(
      actor,
      definition.attribute,
      "attack",
      null,
      null,
      {
        actorTokenUuid: actorToken.uuid,
        targetTokenUuid: targetToken.uuid,
      },
    );
  return {
    ...roll,
    schemaVersion: 1,
    source: structuredClone(definition.source),
    handler: definition.handler,
    itemUuid: item.uuid,
    combatUuid: combat.uuid,
    participantId,
    encounterRevision,
    weapon: {
      uuid: weapon.uuid,
      catalogId: weapon.system.catalogId,
      hands: weapon.system.hands,
    },
    target: {
      tokenUuid: targetToken.uuid,
      actorUuid: target.uuid,
      actorType: target.type,
    },
    geometry,
  };
}

function selectedTarget(actorToken, actor, requestedUuid, nativeTargets) {
  const options = targetOptions(actorToken, actor),
    available = new Set(options.map((entry) => entry.uuid)),
    requested =
      typeof requestedUuid === "string" && requestedUuid
        ? requestedUuid
        : null,
    uuid =
      requested && available.has(requested)
        ? requested
        : !requested
          ? (nativeTargets.length === 1 && available.has(nativeTargets[0])
            ? nativeTargets[0] : null)
          : null;
  return {
    options,
    tokenUuid: uuid ?? null,
    requestedUnavailable: Boolean(requested && !available.has(requested)),
  };
}

export function basicMeleeDialogContext(
  item,
  combat,
  participantId,
  selection = {},
) {
  const actor = item?.actor,
    definition = definitionFor(item),
    reasons = [],
    weapons = actor ? heldMeleeWeapons(actor) : [];
  let actorToken = null;
  try {
    actorToken = exactActorToken(actor);
  } catch (error) {
    reasons.push(error.message);
  }
  const nativeTargets = [...game.user.targets].map(
      (token) => token.document?.uuid ?? token.uuid,
    ),
    targets = actorToken
      ? selectedTarget(
          actorToken,
          actor,
          selection.requireNativeTarget ? null : selection.targetTokenUuid,
          nativeTargets,
        )
      : {
          options: [],
          tokenUuid: null,
          requestedUnavailable: false,
        },
    weaponItemUuid =
      selection.weaponItemUuid ||
      (weapons.length === 1 ? weapons[0].uuid : null),
    rulingReason =
      typeof selection.rulingReason === "string"
        ? selection.rulingReason.trim()
        : "";
  if (!weapons.length) reasons.push("Requires a held compatible melee weapon.");
  else if (!weaponItemUuid) reasons.push("Choose the melee weapon used.");
  if (targets.requestedUnavailable)
    reasons.push(
      "The selected Basic Melee target is not visible or available to this user. Choose an available target or ask the DA to adjudicate.",
    );
  else if (!targets.tokenUuid)
    reasons.push("Use Foundry targeting to select exactly one adjacent creature.");
  if (selection.requireNativeTarget && selection.targetTokenUuid !== targets.tokenUuid)
    reasons.push("Your Foundry target changed. Review the current target and attack again.");
  let basis = null,
    plan = null,
    planError = "",
    geometry = null,
    actionReason = "",
    ruling = null;
  if (
    actorToken &&
    targets.tokenUuid &&
    weaponItemUuid &&
    weapons.some((weapon) => weapon.uuid === weaponItemUuid)
  ) {
    try {
      const targetToken = fromUuidSync(targets.tokenUuid),
        weapon = fromUuidSync(weaponItemUuid),
        state = combat.getFlag(ID, "encounter");
      basis = buildBasis({
        actor,
        actorToken,
        targetToken,
        item,
        definition,
        weapon,
        combat,
        participantId,
        encounterRevision: state?.revision ?? 0,
      });
      geometry = basis.geometry;
      ruling =
        game.user.isGM && rulingReason
          ? { userId: game.user.id, reason: rulingReason }
          : null;
      actionPreview(actor, combat, participantId, "basic-melee-preview", ruling);
      try {
        plan = prepareRoll(basis, selection.draft ?? {});
      } catch (error) {
        planError = error.message;
      }
      if (geometry.status !== "adjacent") {
        if (ruling)
          ruling = {
            userId: game.user.id,
            reason: ruling.reason,
            geometryStatus: geometry.status,
          };
        else reasons.push(geometry.reason);
      }
    } catch (error) {
      actionReason = error.message;
      reasons.push(error.message);
    }
  }
  return {
    actor,
    item,
    definition,
    combat,
    participantId,
    actorToken,
    weapons: weapons.map((weapon) => ({
      uuid: weapon.uuid,
      name: weapon.name,
      hands: weapon.system.hands,
      selected: weapon.uuid === weaponItemUuid,
    })),
    weaponItemUuid,
    targets: targets.options.map((target) => ({
      ...target,
      selected: target.uuid === targets.tokenUuid,
    })),
    targetTokenUuid: targets.tokenUuid,
    basis,
    plan,
    planError,
    geometry,
    ruling,
    actionReason,
    rulingReason,
    reasons: [...new Set(reasons.filter(Boolean))],
  };
}

function requestRecipients(actor) {
  return game.users
    .filter(
      (user) =>
        user.isGM || user.id === game.user.id || actor.testUserPermission(user, "OWNER"),
    )
    .map((user) => user.id);
}

export async function requestPlayerBasicMelee(
  item,
  combat,
  participantId,
  selection,
) {
  if (!game.settings.get(ID, "creationAuthorityClient"))
    throw new Error("Enable the GM automation coordinator first.");
  const request = playerBasicMeleeRequestData(
    item,
    combat,
    participantId,
    selection,
  );
  return ChatMessage.create({
    content: "Basic Melee prepared; waiting for the GM coordinator.",
    speaker: ChatMessage.getSpeaker({
      actor: item.actor,
      token: fromUuidSync(request.basis.actorTokenUuid),
    }),
    whisper: requestRecipients(item.actor),
    flags: { [ID]: { playerAttackRequest: request } },
  });
}

export function playerBasicMeleeRequestData(
  item,
  combat,
  participantId,
  selection,
) {
  const context = basicMeleeDialogContext(
    item,
    combat,
    participantId,
    selection,
  );
  if (!context.basis || context.reasons.length || context.planError)
    throw new Error(
      [...context.reasons, context.planError].filter(Boolean).join(" ") ||
        "Basic Melee could not be prepared.",
    );
  const draft = structuredClone(selection.draft ?? {}),
    ruling =
      context.ruling ??
      (game.user.isGM &&
      typeof selection.rulingReason === "string" &&
      selection.rulingReason.trim()
        ? {
            userId: game.user.id,
            reason: selection.rulingReason.trim(),
          }
        : null),
    request = {
      itemUuid: item.uuid,
      actorUuid: item.actor.uuid,
      combatUuid: combat.uuid,
      participantId,
      encounterRevision: context.basis.encounterRevision,
      basis: structuredClone(context.basis),
      draft,
      source: structuredClone(context.definition.source),
      handler: HANDLER,
      ...(ruling ? { ruling: structuredClone(ruling) } : {}),
    };
  return request;
}

function validateRequestShape(request) {
  if (
    !request ||
    request.handler !== HANDLER ||
    request.source?.path !== "design/cards/basic-melee.md" ||
    typeof request.itemUuid !== "string" ||
    typeof request.actorUuid !== "string" ||
    typeof request.combatUuid !== "string" ||
    typeof request.participantId !== "string" ||
    !request.basis ||
    typeof request.basis !== "object" ||
    Array.isArray(request.basis) ||
    !request.draft ||
    typeof request.draft !== "object" ||
    Array.isArray(request.draft)
  )
    throw new Error("The Basic Melee request is malformed.");
}

async function loadFrozenRequest(
  message,
  request,
) {
  validateRequestShape(request);
  const actor = await fromUuid(request.actorUuid),
    item = await fromUuid(request.itemUuid),
    combat = await fromUuid(request.combatUuid);
  if (
    actor?.type !== "character" ||
    item?.actor?.uuid !== actor.uuid ||
    combat?.documentName !== "Combat"
  )
    throw new Error("The Basic Melee source is unavailable or changed.");
  if (
    !message.author ||
    (!message.author.isGM &&
      !actor.testUserPermission(message.author, "OWNER"))
  )
    throw new Error(
      "The original Basic Melee author no longer has permission to use this character.",
    );
  const definition = definitionFor(item),
    actorToken = fromUuidSync(request.basis.actorTokenUuid),
    targetToken = fromUuidSync(request.basis.targetTokenUuid),
    weapon = fromUuidSync(request.basis.weapon?.uuid),
    participant = combat.combatants.get(request.participantId),
    state = combat.getFlag(ID, "encounter");
  if (
    actorToken?.documentName !== "Token" ||
    actorToken.actor?.uuid !== actor.uuid
  )
    throw new Error("The exact acting token changed. Prepare Basic Melee again.");
  if (
    targetToken?.documentName !== "Token" ||
    targetToken.actor?.uuid !== request.basis.target?.actorUuid
  )
    throw new Error("The selected Basic Melee target changed.");
  if (!message.author.isGM && targetToken.hidden === true)
    throw new Error(
      "The selected Basic Melee target is hidden from its request author. Prepare Basic Melee again or ask the DA to adjudicate.",
    );
  if (
    !actorTokenMatchesParticipant({
      actor,
      actorToken,
      participant,
    })
  )
    throw new Error("The acting character is not that encounter participant.");
  if (
    !state ||
    !Number.isSafeInteger(request.encounterRevision) ||
    state.revision !== request.encounterRevision
  )
    throw new Error("The encounter changed. Prepare Basic Melee again.");
  const current = buildBasis({
    actor,
    actorToken,
    targetToken,
    item,
    definition,
    weapon,
    combat,
    participantId: request.participantId,
    encounterRevision: request.encounterRevision,
  });
  const { geometry: currentGeometry, ...currentFrozen } = current,
    { geometry: frozenGeometry, ...requestFrozen } = request.basis;
  if (
    !frozenGeometry ||
    !basicMeleeRequestMatches(currentFrozen, requestFrozen)
  )
    throw new Error(
      "The weapon, target, roll sources or adjacency changed. Prepare Basic Melee again.",
    );
  const rulingReason =
      typeof request.ruling?.reason === "string"
        ? request.ruling.reason.trim()
        : "",
    ruling =
      message.author.isGM && rulingReason
        ? { userId: message.author.id, reason: rulingReason }
        : null;
  if (currentGeometry.status !== "adjacent" && !ruling)
    throw new Error(currentGeometry.reason);
  const action = actionPreview(
    actor,
    combat,
    request.participantId,
    message.id,
    ruling,
  );
  prepareRoll(current, request.draft);
  return {
    actor,
    actorToken,
    targetToken,
    item,
    weapon,
    combat,
    definition,
    current,
    action,
    ruling: ruling
      ? {
          ...ruling,
          geometryStatus: currentGeometry.status,
        }
      : null,
  };
}

function findPlayerAttackOperation(id) {
  for (const combat of game.combats) {
    const operation = combat.getFlag(ID, "playerAttackOperations")?.[id];
    if (operation) {
      if (operation.operationId !== id)
        throw new Error("The durable Basic Melee operation identity changed.");
      return {
        combat,
        operation,
        receipt: combat.getFlag(ID, "operationReceipts")?.[id],
      };
    }
  }
  return null;
}

function attackBasisMatchesRequest(operation) {
  const basis = structuredClone(operation.basis ?? {}),
    requested = structuredClone(operation.request?.basis ?? {});
  delete basis.geometry;
  delete requested.geometry;
  return basicMeleeRequestMatches(basis, requested);
}

export function validateStoredPlayerAttackOperation(operation) {
  validateRequestShape(operation?.request);
  if (
    operation.kind !== "player-basic-melee" ||
    typeof operation.operationId !== "string" ||
    !operation.operationId ||
    operation.handler !== HANDLER ||
    typeof operation.authorId !== "string" ||
    typeof operation.combatId !== "string" ||
    operation.requestSignature !== JSON.stringify(operation.request) ||
    operation.actorUuid !== operation.request.actorUuid ||
    operation.itemUuid !== operation.request.itemUuid ||
    operation.actorTokenUuid !== operation.request.basis.actorTokenUuid ||
    operation.basis?.target?.tokenUuid !==
      operation.request.basis.target?.tokenUuid ||
    operation.basis?.target?.actorUuid !==
      operation.request.basis.target?.actorUuid ||
    operation.basis?.weapon?.uuid !==
      operation.request.basis.weapon?.uuid ||
    operation.combatId !== operation.request.combatUuid.split(".").at(-1) ||
    operation.participantId !== operation.request.participantId ||
    operation.encounterRevision !== operation.request.encounterRevision ||
    !attackBasisMatchesRequest(operation) ||
    JSON.stringify(operation.draft) !==
      JSON.stringify(operation.request.draft) ||
    JSON.stringify(operation.source) !==
      JSON.stringify(operation.request.source) ||
    JSON.stringify(operation.weapon) !==
      JSON.stringify(operation.basis?.weapon) ||
    typeof operation.turnId !== "string" ||
    !Number.isSafeInteger(operation.encounterRevision)
  )
    throw new Error("The durable Basic Melee operation changed.");
  validateActionReceipt(operation.actionReceipt);
}

async function loadCommittedRequest(operation, message) {
  validateStoredPlayerAttackOperation(operation);
  const request = operation.request,
    actor = await fromUuid(request.actorUuid),
    item = await fromUuid(request.itemUuid),
    combat = await fromUuid(request.combatUuid),
    author = game.users.get(operation.authorId);
  if (
    actor?.type !== "character" ||
    item?.actor?.uuid !== actor.uuid ||
    combat?.documentName !== "Combat" ||
    combat.id !== operation.combatId ||
    !author ||
    (!author.isGM && !actor.testUserPermission(author, "OWNER"))
  )
    throw new Error("The original Basic Melee source or author changed.");
  if (message && message.author?.id !== operation.authorId)
    throw new Error("The Basic Melee presentation author changed.");
  const definition = definitionFor(item),
    actorToken = fromUuidSync(request.basis.actorTokenUuid),
    targetToken = fromUuidSync(request.basis.targetTokenUuid),
    weapon = fromUuidSync(request.basis.weapon?.uuid),
    participant = combat.combatants.get(request.participantId),
    state = combat.getFlag(ID, "encounter"),
    budget = state?.budgets?.[request.participantId],
    declaration = budget?.operations?.[operation.operationId];
  if (
    actorToken?.documentName !== "Token" ||
    actorToken.actor?.uuid !== actor.uuid ||
    targetToken?.documentName !== "Token" ||
    targetToken.actor?.uuid !== request.basis.target?.actorUuid ||
    !actorTokenMatchesParticipant({
      actor,
      actorToken,
      participant,
    })
  )
    throw new Error("The exact Basic Melee token or participant changed.");
  if (
    !state ||
    state.revision !== operation.encounterRevision + 1 ||
    state.current !== request.participantId ||
    !budget ||
    budget.turnId !== operation.turnId ||
    budget.remaining.main !== 0
  )
    throw new Error("The committed encounter budget changed.");
  validateActionReceipt(declaration);
  if (declaration.status !== "declared")
    throw new Error("Only a declared Basic Melee can continue to its roll.");
  const current = buildBasis({
    actor,
    actorToken,
    targetToken,
    item,
    definition,
    weapon,
    combat,
    participantId: request.participantId,
    encounterRevision: operation.encounterRevision,
  });
  const { geometry, ...currentFrozen } = current,
    frozenBasis = structuredClone(operation.basis);
  delete frozenBasis.geometry;
  if (!basicMeleeRequestMatches(currentFrozen, frozenBasis))
    throw new Error(
      "The weapon, target, roll sources or adjacency changed. The declared Main remains spent.",
    );
  if (geometry.status !== "adjacent" && !operation.ruling)
    throw new Error(geometry.reason);
  return {
    actor,
    actorToken,
    targetToken,
    item,
    weapon,
    combat,
    definition,
    state,
    budget,
    geometry,
  };
}

function nativeRetainedFaces(rollData) {
  const retained = [],
    seen = new Set();
  const visit = (value) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value.results))
      for (const result of value.results)
        if (result?.active === true)
          retained.push(result.result);
    for (const key of ["terms", "rolls"])
      if (Array.isArray(value[key]))
        for (const term of value[key]) visit(term);
  };
  visit(rollData);
  return retained;
}

function normalizedFormula(value) {
  return typeof value === "string"
    ? value
        .replace(/\s+/g, "")
        .toLowerCase()
        .replace(/\+\((-?\d+)\)$/, "+$1")
    : null;
}

function validateOperationResult(operation) {
  const authoritative = operation?.result,
    snapshot = authoritative?.snapshot;
  if (!authoritative || !snapshot)
    throw new Error(
      "This Basic Melee has no authoritative saved result. It will not reroll.",
    );
  const plan = prepareRoll(operation.basis, operation.draft),
    recovery = authoritative.recovery ?? null,
    retained = recovery
      ? structuredClone(recovery.retained)
      : nativeRetainedFaces(authoritative.roll);
  if (recovery) {
    if (
      typeof recovery.userId !== "string" ||
      !recovery.userId ||
      !game.users.get(recovery.userId)?.isGM ||
      typeof recovery.reason !== "string" ||
      !recovery.reason.trim() ||
      !Array.isArray(recovery.retained) ||
      JSON.stringify(recovery.retained) !== JSON.stringify(retained)
    )
      throw new Error("The DA retained-dice recovery record changed.");
  } else if (
    !authoritative.roll ||
    normalizedFormula(authoritative.roll.formula) !==
      normalizedFormula(plan.formula)
  )
    throw new Error("The authoritative Basic Melee roll formula changed.");
  if (!woundApplicabilityMatches(snapshot, operation.draft))
    throw new Error(
      "The authoritative Basic Melee wound applicability changed.",
    );
  if (
    snapshot.formula !== plan.formula ||
    snapshot.attribute !== plan.attribute ||
    snapshot.boons !== plan.boons ||
    snapshot.banes !== plan.banes ||
    snapshot.canceled !== plan.canceled ||
    snapshot.net !== plan.net ||
    snapshot.count !== plan.count ||
    JSON.stringify(snapshot.sources) !== JSON.stringify(plan.sources) ||
    snapshot.attributeKey !== operation.basis.attributeKey ||
    snapshot.mode !== "attack" ||
    snapshot.actorUuid !== operation.actorUuid ||
    snapshot.actorTokenUuid !== operation.basis.actorTokenUuid ||
    snapshot.targetActorUuid !== operation.basis.target.actorUuid ||
    snapshot.targetTokenUuid !== operation.basis.target.tokenUuid ||
    snapshot.rollerId !== operation.authorId ||
    (recovery &&
      JSON.stringify(snapshot.recovery) !== JSON.stringify(recovery)) ||
    JSON.stringify(snapshot.retained) !== JSON.stringify(retained)
  )
    throw new Error("The authoritative Basic Melee basis or target changed.");
  const result = classifyRoll(retained, plan.attribute),
    amount = basicMeleeDamage(result.tier);
  if (
    snapshot.tier !== result.tier ||
    snapshot.total !== result.total ||
    snapshot.natural !== result.natural ||
    snapshot.attackOutcome?.damage !== amount ||
    snapshot.attackOutcome?.type !== "physical"
  )
    throw new Error("The authoritative Basic Melee outcome changed.");
  return { snapshot, retained, amount, recovery };
}

function pendingAbilitySettlement(combat, operationId) {
  return combat.getFlag(ID, "pendingAbility") === operationId
    ? { [`flags.${ID}.pendingAbility`]: null }
    : {};
}

async function finishOperation(_message, combat, operation, replay) {
  await writeAuthorityDocument(combat, {
    [`flags.${ID}.playerAttackOperations.${operation.operationId}`]: operation,
    ...pendingAbilitySettlement(combat, operation.operationId),
    [`flags.${ID}.operationReceipts.${operation.operationId}`]: {
      applied: true,
      kind: "player-basic-melee",
      status: operation.status,
      authorId: operation.authorId,
      request: operation.requestSignature,
      presentation: "complete",
    },
  });
  return { status: operation.status, replay };
}

function attackCard(message, operation, snapshot, recovery) {
  return {
    schemaVersion: 2,
    operationId: message.id,
    title: "Basic Melee",
    source: structuredClone(operation.source),
    combatId: operation.combatId,
    encounterRevision: operation.encounterRevision,
    attackerName: operation.attackerName,
    actorUuid: operation.actorUuid,
    actorTokenUuid: operation.basis.actorTokenUuid,
    targetName: operation.targetName,
    targetActorUuid: operation.basis.target.actorUuid,
    targetTokenUuid: operation.basis.target.tokenUuid,
    weaponUuid: operation.weapon.uuid,
    weaponName: operation.weaponName,
    attributeKey: snapshot.attributeKey,
    attribute: snapshot.attribute,
    tier: snapshot.tier,
    total: snapshot.total,
    retained: snapshot.retained,
    damage: snapshot.attackOutcome.damage,
    type: snapshot.attackOutcome.type,
    recovery,
  };
}

async function presentAttack(message, operation) {
  const { snapshot, recovery } = validateOperationResult(operation),
    card = attackCard(message, operation, snapshot, recovery),
    content = await foundry.applications.handlebars.renderTemplate(
      "systems/heroes-of-legend/templates/player-attack-card.hbs",
      {
        ...card,
        tierLabel: game.i18n.localize(`HOL.Tiers.${card.tier}`),
      },
    ),
    roll = operation.result.roll
      ? foundry.dice.Roll.fromJSON(JSON.stringify(operation.result.roll))
      : null;
  await message.update({
    content,
    rolls: roll ? [roll] : [],
    [`flags.${ID}.playerAttackRequest`]: structuredClone(operation.request),
    [`flags.${ID}.roll`]: structuredClone(snapshot),
    [`flags.${ID}.playerAttack`]: card,
  });
  return card;
}

function evaluatedResult(operation, evaluated) {
  const snapshot = structuredClone(evaluated.snapshot);
  snapshot.actorTokenUuid = operation.basis.actorTokenUuid;
  snapshot.targetActorUuid = operation.basis.target.actorUuid;
  snapshot.targetTokenUuid = operation.basis.target.tokenUuid;
  snapshot.attackOutcome = {
    damage: basicMeleeDamage(snapshot.tier),
    type: "physical",
    applied: false,
  };
  return {
    schemaVersion: 1,
    snapshot,
    roll: evaluated.roll.toJSON(),
    recovery: null,
  };
}

function recoveryResult(operation, retained, result, recovery) {
  const amount = basicMeleeDamage(result.tier),
    plan = prepareRoll(operation.basis, operation.draft),
    snapshot = {
      schemaVersion: 2,
      actorUuid: operation.actorUuid,
      actorTokenUuid: operation.basis.actorTokenUuid,
      targetActorUuid: operation.basis.target.actorUuid,
      targetTokenUuid: operation.basis.target.tokenUuid,
      rollerId: operation.authorId,
      attackMessageId: null,
      attackOutcome: {
        damage: amount,
        type: "physical",
        applied: false,
      },
      attributeKey: operation.basis.attributeKey,
      mode: "attack",
      perception: structuredClone(operation.draft.perception ?? {}),
      woundApplicability: structuredClone(
        operation.draft.woundApplicability ?? {},
      ),
      ...plan,
      retained: [...retained],
      ...result,
      recovery: structuredClone(recovery),
    };
  return { schemaVersion: 1, snapshot, roll: null, recovery };
}

export function resolvePlayerBasicMeleeRequest(id) {
  return enqueueCharacterOperation(() => apply(id), { requestId: id });
}

async function interruptDeclaredAttack(id, combat, operation, error) {
  const message = game.messages.get(id),
    state = combat.getFlag(ID, "encounter"),
    budget = state?.budgets?.[operation.participantId];
  if (
    !budget ||
    state.revision !== operation.encounterRevision + 1 ||
    budget.operations?.[id]?.status !== "declared"
  )
    throw error;
  const actor = await fromUuid(operation.actorUuid),
    continuation = continueAction(
      budget,
      { hp: actor?.system.health?.value ?? 0, items: {} },
      { operationId: id, capable: false },
    ),
    next = structuredClone(state);
  next.budgets[operation.participantId] = continuation.state;
  next.revision++;
  operation = {
    ...operation,
    status: "interrupted",
    actionReceipt: structuredClone(
      continuation.state.operations[id],
    ),
    interrupted: {
      reason: error.message,
      userId: operation.authorId,
    },
  };
  await writeAuthorityDocument(combat, {
    [`flags.${ID}.encounter`]: next,
    [`flags.${ID}.playerAttackOperations.${id}`]: operation,
  });
  if (message)
    await message
      .update({
        content: `Basic Melee stopped before dice after its Main Action was committed: ${foundry.utils.escapeHTML(error.message)}`,
        [`flags.${ID}.playerAttackStatus`]: "interrupted",
      })
      .catch(() => {});
  return finishOperation(message, combat, operation, false);
}

async function continueAndEvaluate(id, combat) {
  const message = game.messages.get(id),
    operation = combat.getFlag(ID, "playerAttackOperations")?.[id];
  if (!message) {
    return {
      status: operation?.status ?? "unknown",
      replay: true,
      presentation: "deleted",
    };
  }
  let checked;
  try {
    checked = await loadCommittedRequest(operation, message);
  } catch (error) {
    return interruptDeclaredAttack(id, combat, operation, error);
  }
  const continuation = continueAction(
      checked.budget,
      { hp: checked.actor.system.health.value, items: {} },
      { operationId: id, capable: true },
    ),
    state = structuredClone(checked.state);
  state.budgets[operation.participantId] = continuation.state;
  state.revision++;
  let resolving = {
    ...operation,
    status: "resolving",
    actionReceipt: structuredClone(continuation.state.operations[id]),
  };
  await writeAuthorityDocument(combat, {
    [`flags.${ID}.encounter`]: state,
    [`flags.${ID}.playerAttackOperations.${id}`]: resolving,
  });
  const evaluated = await evaluatePreparedRoll(
    checked.actor,
    operation.basis,
    operation.draft,
    { rollerId: operation.authorId },
  );
  resolving = {
    ...resolving,
    status: "complete",
    result: evaluatedResult(operation, evaluated),
  };
  await writeAuthorityDocument(combat, {
    [`flags.${ID}.playerAttackOperations.${id}`]: resolving,
  });
  await presentAttack(message, resolving);
  return finishOperation(message, combat, resolving, false);
}

function validateSettledReceipt(receipt, operation) {
  const acknowledgement = receipt?.presentationAcknowledgement;
  if (
    receipt?.applied !== true ||
    receipt.kind !== "player-basic-melee" ||
    receipt.status !== operation.status ||
    receipt.authorId !== operation.authorId ||
    receipt.request !== operation.requestSignature ||
    !["complete", "missing"].includes(receipt.presentation)
  )
    throw new Error("The settled Basic Melee receipt changed.");
  if (
    acknowledgement !== undefined &&
    (receipt.presentation !== "missing" ||
      typeof acknowledgement?.userId !== "string" ||
      !game.users.get(acknowledgement.userId)?.isGM ||
      typeof acknowledgement?.reason !== "string" ||
      !acknowledgement.reason.trim())
  )
    throw new Error(
      "The missing Basic Melee presentation acknowledgement changed.",
    );
}

async function preserveMissingPresentation(combat, operation, receipt) {
  if (receipt?.presentation !== "missing")
    await writeAuthorityDocument(combat, {
      [`flags.${ID}.operationReceipts.${operation.operationId}`]: {
        applied: true,
        kind: "player-basic-melee",
        status: operation.status,
        authorId: operation.authorId,
        request: operation.requestSignature,
        presentation: "missing",
      },
    });
  return {
    status: operation.status,
    replay: true,
    presentation: "deleted",
  };
}

async function apply(id) {
  const message = game.messages.get(id),
    found = findPlayerAttackOperation(id);
  let combat = found?.combat ?? null,
    operation = found?.operation ?? null,
    receipt = found?.receipt ?? null;
  if (operation) {
    validateStoredPlayerAttackOperation(operation);
    if (message && message.author?.id !== operation.authorId)
      throw new Error("The Basic Melee presentation author changed.");
    if (receipt?.applied) {
      validateSettledReceipt(receipt, operation);
      if (operation.status === "interrupted" && !operation.result)
        return { status: operation.status, replay: true };
      validateOperationResult(operation);
      if (!message) return preserveMissingPresentation(combat, operation, receipt);
      await presentAttack(message, operation);
      return { status: operation.status, replay: true };
    }
    if (operation.result) {
      validateOperationResult(operation);
      if (!message) return preserveMissingPresentation(combat, operation, receipt);
      await presentAttack(message, operation);
      return finishOperation(message, combat, operation, true);
    }
    if (!message)
      return {
        status: operation.status,
        replay: true,
        presentation: "deleted",
      };
    if (operation.status === "declared")
      return continueAndEvaluate(id, combat);
    throw new Error(
      "This Basic Melee reservation has no authoritative saved result. It will not reroll; the DA must recover the retained dice from Manage automation.",
    );
  }
  const request = message?.getFlag(ID, "playerAttackRequest");
  if (!message?.author) throw new Error("The original attack request is unavailable.");
  validateRequestShape(request);
  combat = await fromUuid(request.combatUuid);
  if (combat?.documentName !== "Combat")
    throw new Error("The Basic Melee encounter is unavailable.");
  if (
    combat.getFlag(ID, "pendingAbility") ||
    combat.getFlag(ID, "pendingTurnPhase")
  )
    throw new Error("Resolve the pending encounter action first.");
  const checked = await loadFrozenRequest(message, request),
    requestSignature = JSON.stringify(request),
    state = structuredClone(checked.action.state);
  state.budgets[request.participantId] = structuredClone(
    checked.action.declared,
  );
  state.revision++;
  operation = {
    status: "declared",
    kind: "player-basic-melee",
    operationId: id,
    authorId: message.author.id,
    actorUuid: checked.actor.uuid,
    actorTokenUuid: checked.actorToken.uuid,
    participantId: request.participantId,
    combatId: combat.id,
    encounterRevision: request.encounterRevision,
    turnId: checked.action.budget.turnId,
    itemUuid: checked.item.uuid,
    handler: HANDLER,
    source: structuredClone(checked.definition.source),
    requestSignature,
    request: structuredClone(request),
    basis: structuredClone(checked.current),
    draft: structuredClone(request.draft),
    weapon: structuredClone(checked.current.weapon),
    weaponName: checked.weapon.name,
    attackerName: checked.actor.name,
    targetName: checked.targetToken.name,
    ruling: checked.ruling,
    actionReceipt: structuredClone(
      state.budgets[request.participantId].operations[id],
    ),
  };
  await writeAuthorityDocument(combat, {
    [`flags.${ID}.encounter`]: state,
    [`flags.${ID}.pendingAbility`]: id,
    [`flags.${ID}.playerAttackOperations.${id}`]: operation,
  });
  return continueAndEvaluate(id, combat);
}

export function recoverPlayerBasicMeleeRequest(id, { retained, reason } = {}) {
  return enqueueCharacterOperation(
    async () => {
      if (!game.user.isGM)
        throw new Error("Only the actual DA can recover an unknown attack result.");
      const message = game.messages.get(id),
        found = findPlayerAttackOperation(id),
        combat = found?.combat;
      let operation = found?.operation,
        receipt = found?.receipt;
      if (
        !combat ||
        !operation ||
        typeof reason !== "string" ||
        !reason.trim()
      )
        throw new Error("A retained-dice recovery needs the original request and a DA reason.");
      validateStoredPlayerAttackOperation(operation);
      if (message && message.author?.id !== operation.authorId)
        throw new Error("The Basic Melee presentation author changed.");
      if (operation.result) {
        validateOperationResult(operation);
        if (!message) return preserveMissingPresentation(combat, operation, receipt);
        await presentAttack(message, operation);
        return receipt?.applied
          ? { status: operation.status, replay: true }
          : finishOperation(message, combat, operation, false);
      }
      if (!["declared", "resolving"].includes(operation.status))
        throw new Error("Only an unresolved attack can recover dice.");
      if (
        !Array.isArray(retained) ||
        retained.length !== 3 ||
        retained.some(
          (face) => !Number.isSafeInteger(face) || face < 1 || face > 6,
        )
      )
        throw new Error("Enter exactly three retained d6 faces.");
      if (operation.status === "declared") {
        const state = combat.getFlag(ID, "encounter"),
          budget = state?.budgets?.[operation.participantId],
          actor = await fromUuid(operation.actorUuid);
        if (
          !budget ||
          state.revision !== operation.encounterRevision + 1 ||
          budget.operations?.[id]?.status !== "declared"
        )
          throw new Error("The declared encounter budget changed.");
        const continuation = continueAction(
            budget,
            { hp: actor?.system.health?.value ?? 0, items: {} },
            { operationId: id, capable: true },
          ),
          next = structuredClone(state);
        next.budgets[operation.participantId] = continuation.state;
        next.revision++;
        operation = {
          ...operation,
          status: "resolving",
          actionReceipt: structuredClone(continuation.state.operations[id]),
        };
        await writeAuthorityDocument(combat, {
          [`flags.${ID}.encounter`]: next,
          [`flags.${ID}.playerAttackOperations.${id}`]: operation,
        });
      }
      const result = classifyRoll(retained, operation.basis.attribute),
        recovery = {
          userId: game.user.id,
          reason: reason.trim(),
          retained: [...retained],
        },
        authoritative = recoveryResult(
          operation,
          retained,
          result,
          recovery,
        );
      operation = {
        ...operation,
        status: "complete",
        result: authoritative,
      };
      await writeAuthorityDocument(combat, {
        [`flags.${ID}.playerAttackOperations.${id}`]: operation,
      });
      if (!message) {
        receipt = null;
        return preserveMissingPresentation(combat, operation, receipt);
      }
      await presentAttack(message, operation);
      return finishOperation(message, combat, operation, false);
    },
    { requestId: id },
  );
}

export function acknowledgeMissingPlayerBasicMeleePresentation(
  id,
  { reason } = {},
) {
  return enqueueCharacterOperation(
    async () => {
      if (!game.user.isGM)
        throw new Error(
          "Only the actual DA can acknowledge a missing attack presentation.",
        );
      if (typeof reason !== "string" || !reason.trim())
        throw new Error(
          "A missing Basic Melee presentation acknowledgement needs a DA reason.",
        );
      if (game.messages.has(id))
        throw new Error("The Basic Melee presentation is available.");
      const found = findPlayerAttackOperation(id),
        combat = found?.combat,
        operation = found?.operation,
        receipt = found?.receipt;
      if (!combat || !operation)
        throw new Error("The original Basic Melee operation is unavailable.");
      validateStoredPlayerAttackOperation(operation);
      if (
        operation.status !== "complete" ||
        !operation.result ||
        receipt?.applied !== true
      )
        throw new Error(
          "Only a durably settled Basic Melee can acknowledge a missing presentation.",
        );
      validateSettledReceipt(receipt, operation);
      validateOperationResult(operation);
      if (receipt.presentation !== "missing")
        throw new Error("The Basic Melee presentation is not recorded as missing.");
      const existing = receipt.presentationAcknowledgement,
        pendingClear = pendingAbilitySettlement(combat, id);
      if (existing) {
        if (combat.getFlag(ID, "pendingAbility") === id)
          await writeAuthorityDocument(combat, pendingClear);
        return { status: "acknowledged", replay: true };
      }
      const acknowledgement = {
        userId: game.user.id,
        reason: reason.trim(),
      };
      await writeAuthorityDocument(combat, {
        ...pendingClear,
        [`flags.${ID}.operationReceipts.${id}`]: {
          ...receipt,
          presentationAcknowledgement: acknowledgement,
        },
      });
      return {
        status: "acknowledged",
        replay: false,
        pendingCleared: Object.hasOwn(
          pendingClear,
          `flags.${ID}.pendingAbility`,
        ),
      };
    },
    { requestId: id },
  );
}

export function playerBasicMeleeDamage(messageOrId) {
  const id =
      typeof messageOrId === "string" ? messageOrId : messageOrId?.id,
    found = findPlayerAttackOperation(id),
    operation = found?.operation,
    receipt = found?.receipt;
  if (
    !operation ||
    operation.status !== "complete" ||
    receipt?.applied !== true
  )
    throw new Error("Choose a settled player Basic Melee result.");
  validateSettledReceipt(receipt, operation);
  const validated = validateOperationResult(operation);
  return {
    actorUuid: operation.basis.target.actorUuid,
    components: [{ type: "physical", amount: validated.amount }],
    eventId: `player-basic-melee-${id}`,
    attackMessageId: id,
    source: structuredClone(operation.source),
  };
}

export function pendingPlayerAttacks(combat) {
  const pending = combat?.getFlag(ID, "pendingAbility"),
    operations = combat?.getFlag(ID, "playerAttackOperations") ?? {};
  return Object.keys(operations).filter(
    (id) => pending === id || !game.messages.has(id),
  );
}

export function renderPlayerBasicMeleeCard(message, element) {
  const card = message?.getFlag(ID, "playerAttack");
  if (!card || !message.isContentVisible || !game.user.isGM) return;
  const root = element.querySelector(".hol-player-attack-card"),
    status = root?.querySelector(".hol-attack-damage-status");
  if (!root || !status || root.querySelector(".hol-player-attack-damage")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "hol-player-attack-damage";
  button.textContent = "Review and apply target damage";
  button.addEventListener("click", async () => {
    try {
      const { openPlayerAttackDamage } = await import(
        "../applications/damage.mjs"
      );
      await openPlayerAttackDamage(message);
    } catch (error) {
      status.textContent = error.message;
    }
  });
  root.append(button);
}

export function registerPlayerBasicMeleeRequests() {
  Hooks.on("createChatMessage", (message) => {
    if (message.getFlag(ID, "playerAttackRequest") && isCreationAuthority())
      resolvePlayerBasicMeleeRequest(message.id).catch((error) => {
        ui.notifications.error(error.message);
        message
          .update({
            content: `Basic Melee needs attention: ${foundry.utils.escapeHTML(error.message)}`,
            [`flags.${ID}.playerAttackStatus`]: "failed",
          })
          .catch(() => {});
      });
  });
}
