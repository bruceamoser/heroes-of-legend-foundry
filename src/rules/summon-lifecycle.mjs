/** Controller turns use the encounter serial, never wall-clock time. */
export function summonTurnKey(combatUuid, state) {
  if (!combatUuid || !state?.current || !Number.isSafeInteger(state.serial))
    throw new Error("Choose the summoner's encounter turn first.");
  return `${combatUuid}:${state.serial}:${state.current}`;
}
export function recordSummonCommand(lifecycle, {controllerUuid, turnKey, operationId, register = false}) {
  if (typeof register !== "boolean") throw new Error("Invalid summon registration mode.");
  if (!controllerUuid || !turnKey || !operationId) throw new Error("Incomplete summon command identity.");
  if (lifecycle?.receipts?.[operationId]) {
    const receipt = lifecycle.receipts[operationId];
    if (receipt.controllerUuid !== controllerUuid || receipt.turnKey !== turnKey || receipt.register !== register)
      throw new Error("The summon command receipt changed.");
    return lifecycle;
  }
  if (lifecycle?.expired) throw new Error("This summon disappeared. Return to creature and explicitly summon it again.");
  if (register && lifecycle) throw new Error("This summon is already registered; its initial free command cannot be renewed.");
  if (!register && !lifecycle) throw new Error("Register this summon and its controller first.");
  if (lifecycle && lifecycle.controllerUuid !== controllerUuid) throw new Error("This summon belongs to another controller.");
  if (lifecycle?.commandTurn === turnKey) throw new Error("This summon already received its one command this turn.");
  return {...lifecycle, controllerUuid, commandTurn: turnKey, expired: false,
    receipts: {...lifecycle?.receipts, [operationId]: {controllerUuid, turnKey, register}}};
}
export function expireUncommandedSummon(lifecycle, controllerUuid, turnKey) {
  if (!lifecycle || lifecycle.controllerUuid !== controllerUuid || lifecycle.commandTurn === turnKey) return lifecycle;
  if (lifecycle.expired) return lifecycle;
  return {...lifecycle, expired: true, expiredTurn: turnKey};
}
