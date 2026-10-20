/** Players defend as their assigned hero; the DA uses exactly one selected token. */
export function selectedDefender({ isGM = false, controlled = [], character = null, tokens = [] } = {}) {
  if (isGM) {
    if (controlled.length !== 1) throw new Error("Select one token to defend as the GM.");
    const token = controlled[0].document ?? controlled[0];
    if (!token.actor) throw new Error("The selected token has no Actor. Select a token with an Actor to defend.");
    return { actor: token.actor, tokenUuid: token.uuid };
  }
  if (!character) throw new Error("No character is assigned to you. Assign your character in User Configuration to defend.");
  const assigned = tokens.filter((token) => token.actor?.uuid === character.uuid);
  return { actor: character,
    tokenUuid: assigned.length === 1 ? assigned[0].uuid : null };
}
