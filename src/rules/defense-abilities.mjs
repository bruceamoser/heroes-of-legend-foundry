const blocker = {
  defend: {
    ownTurn: "Defend can be used only on the defender's own turn.",
    maneuver: "No Maneuver remains for Defend.",
  },
  "shield-block": {
    attack: "Shield Block requires an incoming attack.",
    judgment: "The DA has not judged this attack blockable.",
    notBlockable: "The DA judged this attack not blockable.",
    shield: "A held shield is required.",
    reaction: "No Reaction remains for Shield Block.",
  },
};

/**
 * Pure preflight shared by the defense dialog and the authoritative service.
 * Ownership is deliberately absent: Defend and Shield Block may be activated
 * by any player handling the selected defender's incoming defense.
 */
export function defenseAttemptContext(rows, actorUuid) {
  if (!Array.isArray(rows))
    return { priorDefenses: 0, unresolvedDefense: false };
  const own = rows.filter((row) => row?.actorUuid === actorUuid);
  return {
    priorDefenses: own.length,
    unresolvedDefense: own.some((row) => row.status === "rolling"),
  };
}

export function defenseAbilityAvailability(id, context = {}) {
  const reasons = [];
  if (context.pending)
    reasons.push("The defender's earlier action is still pending.");
  if (context.capable === false)
    reasons.push("The defender's current condition prevents actions.");
  if (context.unresolvedDefense === true)
    reasons.push(
      "Resolve the current defense attempt before activating another defense ability.",
    );
  else if (
    (context.priorDefenses ?? 0) > 0 &&
    (context.additionalAttempt !== true ||
      typeof context.attemptReason !== "string" ||
      !context.attemptReason.trim())
  )
    reasons.push(
      "An explicit additional defense attempt and reason are required before activating this ability.",
    );

  if (id === "ability-defend") {
    if (context.standalone && context.standaloneActivationAvailable === false)
      reasons.push(
        "Standalone Defend requires ownership of the defender's ability, or DA control.",
      );
    if (!context.ownTurn) reasons.push(blocker.defend.ownTurn);
    if ((context.remaining?.maneuver ?? 0) < 1)
      reasons.push(blocker.defend.maneuver);
  } else if (id === "ability-shield-block") {
    const shieldBlock = blocker["shield-block"];
    if (!context.attackMessageId) reasons.push(shieldBlock.attack);
    if (context.judgmentError) reasons.push(context.judgmentError);
    else if (context.blockable === undefined || context.blockable === null)
      reasons.push(shieldBlock.judgment);
    else if (context.blockable !== true)
      reasons.push(shieldBlock.notBlockable);
    if (!Array.isArray(context.heldShieldUuids) || !context.heldShieldUuids.length)
      reasons.push(shieldBlock.shield);
    if ((context.remaining?.reaction ?? 0) < 1)
      reasons.push(shieldBlock.reaction);
  } else {
    reasons.push("This ability has no reviewed defense handler.");
  }
  return { available: reasons.length === 0, reasons };
}

export function blockableJudgment(incoming) {
  if (!incoming || !Object.hasOwn(incoming, "blockable")) return null;
  return typeof incoming.blockable === "boolean" ? incoming.blockable : undefined;
}
