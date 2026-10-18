import {
  readPortableCharacter,
  MAX_CHARACTER_BYTES,
} from "./portable-character.mjs";

export const PREVIOUS_BOOK_SOURCE = "9bc9b4fe3256e68880b92c45facf0f25b98a1ea3";
export const CURRENT_BOOK_SOURCE = "64089a1c8961d7faff172f179448a8b6e57827ef";

/** Explicit browser draft conversion. Never writes an Actor or alters the original file. */
export function reviewRulesUpdate(input, catalogs, languages) {
  if (
    typeof input === "string" &&
    new TextEncoder().encode(input).length > MAX_CHARACTER_BYTES
  )
    throw new Error("Character file is too large.");
  const original =
    typeof input === "string" ? JSON.parse(input) : structuredClone(input);
  if (
    original?.sourceCommit !== PREVIOUS_BOOK_SOURCE ||
    catalogs.commit !== CURRENT_BOOK_SOURCE
  )
    throw new Error("No reviewed rules update is available for this edition.");
  const candidate = structuredClone(original);
  candidate.sourceCommit = catalogs.commit;
  const draft = candidate.draft;
  const changes = [
    "Six new 1 DP abilities become available to buy. None are automatically learned.",
    "Armor training now requires Armor ranks 1/2/3 at levels 1/3/7. Existing purchases remain for review; invalid choices must be repaired.",
  ];
  if (
    draft?.culture?.id === "origin-culture-walled-communities" &&
    draft.culture.pair === 0
  ) {
    changes.push(
      "Walled Communities now grants Wear Light Armor and ordinary light armor (DR 1) instead of medium. Equipment arrangement and removed-grant state are retained.",
    );
    const before = "grant:ability-wear-medium-armor:item-ordinary-medium-armor";
    const after = "grant:ability-wear-light-armor:item-ordinary-light-armor";
    if (draft.loadout?.[before]) {
      draft.loadout[after] = draft.loadout[before];
      delete draft.loadout[before];
    }
    if (Array.isArray(draft.play?.inventory?.removed))
      draft.play.inventory.removed = draft.play.inventory.removed.map((id) =>
        id === before ? after : id,
      );
  }
  const result = readPortableCharacter(candidate, catalogs, languages);
  return { ...result, original, changes };
}
