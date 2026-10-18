const blocker = {
  defend: {
    ownTurn: "Outside the defender's own turn.",
    maneuver: "No Maneuver remains for Defend.",
  },
  "shield-block": {
    attack: "Shield Block requires an incoming attack.",
    shield: "A held shield is required.",
    reaction: "No Reaction remains for Shield Block.",
  },
};

/**
 * Pure preflight shared by the defense dialog and the authoritative service.
 * Ownership is deliberately absent: Defend and Shield Block may be activated
 * by any player handling the selected defender's incoming defense.
 */
export function defenseAbilityAvailability(id, context = {}) {
  const reasons = [],
    warnings = [];
  if (context.pending)
    reasons.push("The defender's earlier action is still pending.");
  if (context.capable === false)
    warnings.push("The defender's current condition may prevent actions.");
  if (id === "ability-defend") {
    if (context.standalone && context.standaloneActivationAvailable === false)
      reasons.push(
        "Standalone Defend requires ownership of the defender's ability, or DA control.",
      );
    if (!context.ownTurn) warnings.push(blocker.defend.ownTurn);
    if ((context.remaining?.maneuver ?? 0) < 1)
      warnings.push(blocker.defend.maneuver);
  } else if (["ability-shield-block", "ability-high-guard"].includes(id)) {
    const shieldBlock = blocker["shield-block"];
    if (!context.attackMessageId) reasons.push(shieldBlock.attack);
    if (context.judgmentError) reasons.push(context.judgmentError);
    if (
      !Array.isArray(context.heldShieldUuids) ||
      !context.heldShieldUuids.length
    )
      reasons.push(shieldBlock.shield);
    if ((context.remaining?.reaction ?? 0) < 1)
      warnings.push(shieldBlock.reaction);
  } else {
    reasons.push("This ability has no reviewed defense handler.");
  }
  return { available: reasons.length === 0, reasons, warnings };
}

export function blockableJudgment(incoming) {
  if (
    !incoming ||
    incoming.blockable === null ||
    !Object.hasOwn(incoming, "blockable")
  )
    return null;
  return typeof incoming.blockable === "boolean"
    ? incoming.blockable
    : undefined;
}
