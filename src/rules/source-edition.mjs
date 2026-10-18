import {
  readPortableCharacter,
  MAX_CHARACTER_BYTES,
} from "./portable-character.mjs";

export const PREVIOUS_BOOK_SOURCE = "9bc9b4fe3256e68880b92c45facf0f25b98a1ea3";
import { ORIGIN_HISTORY, ORIGIN_HISTORY_SOURCE } from "./origin-history.mjs";

export const CURRENT_BOOK_SOURCE = "d67e046466bdd5052360b96ed91861d607091446";
export const SUPPORTED_BOOK_SOURCES = [
  PREVIOUS_BOOK_SOURCE,
  ORIGIN_HISTORY_SOURCE,
];

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
    !SUPPORTED_BOOK_SOURCES.includes(original?.sourceCommit) ||
    catalogs.commit !== CURRENT_BOOK_SOURCE
  )
    throw new Error("No reviewed rules update is available for this edition.");
  const candidate = structuredClone(original);
  candidate.sourceCommit = catalogs.commit;
  const draft = candidate.draft;
  const changes = [
    "62 new abilities and revised culture/background choices are available. No abilities are automatically purchased.",
    "Your existing origin grants, purchases, equipment arrangements and play notes are retained. New origin choices apply only if you choose a replacement.",
  ];
  const beforeArmorUpdate = original.sourceCommit === PREVIOUS_BOOK_SOURCE;
  if (beforeArmorUpdate)
    changes.push(
      "Armor training now requires Armor ranks 1/2/3 at levels 1/3/7. Existing purchases remain for review; invalid choices must be repaired.",
    );
  if (
    beforeArmorUpdate &&
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
  for (const kind of ["culture", "background"]) {
    const selection = draft?.[kind];
    if (!selection || selection.retainedFrom) continue;
    const previous = ORIGIN_HISTORY[selection.id]?.pairs?.[selection.pair];
    const origin = catalogs.choices.find(
      (record) => record.id === selection.id,
    );
    const current = origin?.pairs?.[selection.pair];
    if (
      previous &&
      (previous.disciplineId !== current?.disciplineId ||
        previous.abilityId !== current?.abilityId)
    ) {
      selection.retainedFrom = ORIGIN_HISTORY_SOURCE;
      changes.push(
        `${origin.name}: retain your original discipline and ability pair. The revised alternatives are available on Culture & background.`,
      );
    }
  }
  const result = readPortableCharacter(candidate, catalogs, languages);
  return { ...result, original, changes };
}
