import { declareAction } from "./actions.mjs";

/** A bonus belongs to this turn, never to Speed or converted allowances. */
export function planSimpleAbility(
  budget,
  {
    operationId,
    definition,
    conditions = {},
    ownTurn = true,
    quickExit = false,
  },
) {
  if (
    !["disengage-v1", "catch-that-v1", "look-over-here-v1"].includes(
      definition?.handler,
    )
  )
    throw new Error("Choose a reviewed simple action.");
  const next = declareAction(budget, {
    operationId,
    sourceId: definition.id,
    category: definition.category,
    conditions,
    ownTurn,
  });
  // Replayed operation IDs do not refresh protection or grant movement again.
  if (budget.operations[operationId]) return next;
  if (definition.handler === "disengage-v1") {
    next.disengaged = true;
    if (quickExit && !next.quickExitUsed) {
      next.bonusMovement = (next.bonusMovement ?? 0) + 1;
      next.quickExitUsed = true;
    }
  }
  next.operations[operationId].status = "complete";
  return next;
}

/** Context selection expresses table judgment; it never implies cover or Hidden. */
export function contextualAbilitySources(basis, draft = {}) {
  const sources = [];
  if (
    draft.partyPiece &&
    basis.mode === "attribute" &&
    basis.attributeKey === "guile" &&
    basis.partyPiece
  )
    sources.push({
      id: "ability-a-party-piece",
      kind: "boon",
      amount: 1,
      label: "A Party Piece · chosen performance specialty",
      automatic: false,
      sourceIds: [basis.partyPiece],
    });
  if (draft.lookOverHere && basis.mode === "defense" && basis.incoming)
    sources.push({
      id: "ability-look-over-here",
      kind: "boon",
      amount: 1,
      label: "Look Over Here! · ally's Reaction",
      automatic: false,
      sourceIds: [],
    });
  return sources;
}
