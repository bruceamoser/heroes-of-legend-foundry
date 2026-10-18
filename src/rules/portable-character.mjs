import { creationPreview } from "./creation.mjs";
import { ATTRIBUTES } from "./character.mjs";

export const PORTABLE_FORMAT = "heroes-of-legend-character";
export const PORTABLE_VERSION = 1;
export const MAX_CHARACTER_BYTES = 262144;
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const string = (value, max = 200) =>
  typeof value === "string" && value.length <= max;
const strings = (value, max = 100) =>
  Array.isArray(value) && value.length <= max && value.every((v) => string(v));
const integer = (value) => Number.isSafeInteger(value);

/** Import choices, never trusted derived statistics, executable content or Actor IDs. */
export function readPortableCharacter(input, catalogs, languages) {
  if (
    typeof input === "string" &&
    new TextEncoder().encode(input).length > MAX_CHARACTER_BYTES
  )
    throw new Error("Character file is too large.");
  const value = typeof input === "string" ? JSON.parse(input) : input;
  if (
    !object(value) ||
    value.format !== PORTABLE_FORMAT ||
    value.schemaVersion !== PORTABLE_VERSION
  )
    throw new Error("Choose a supported Heroes of Legend character JSON file.");
  if (value.sourceCommit !== catalogs.commit)
    throw new Error(
      "This character uses a different rules edition. Keep the file and open it with its matching system version.",
    );
  const d = value.draft;
  const fail = () => {
    throw new Error("The character file contains malformed creation choices.");
  };
  if (
    !object(d) ||
    !string(d.name) ||
    !object(d.attributes) ||
    !ATTRIBUTES.every(
      (key) => integer(d.attributes[key]) && Math.abs(d.attributes[key]) <= 2,
    ) ||
    !strings(d.traitIds) ||
    !strings(d.classDisciplines) ||
    !object(d.languages) ||
    !string(d.languages.home) ||
    !strings(d.languages.extraSpoken) ||
    !object(d.purchases) ||
    !object(d.acquisitions) ||
    !Array.isArray(d.shopping) ||
    d.shopping.length > 200
  )
    fail();
  const draft = {
    name: d.name,
    attributes: Object.fromEntries(
      ATTRIBUTES.map((key) => [key, d.attributes[key]]),
    ),
    traitIds: [...d.traitIds],
    classDisciplines: [...d.classDisciplines],
    languages: {
      home: d.languages.home,
      extraSpoken: [...d.languages.extraSpoken],
    },
    purchases: {},
    acquisitions: {},
    shopping: [],
  };
  for (const key of [
    "ancestryId",
    "classId",
    "signatureId",
    "rememberedCommunity",
  ])
    if (d[key] !== undefined) {
      if (!string(d[key])) fail();
      draft[key] = d[key];
    }
  for (const key of ["culture", "background"])
    if (d[key] !== undefined) {
      if (!object(d[key]) || !string(d[key].id) || !integer(d[key].pair))
        fail();
      draft[key] = { id: d[key].id, pair: d[key].pair };
    }
  for (const stage of [0, 1]) {
    if (!Array.isArray(d.purchases[stage]) || d.purchases[stage].length > 200)
      fail();
    draft.purchases[stage] = d.purchases[stage].map((p) => {
      if (
        !object(p) ||
        !string(p.id) ||
        (p.recipeIds !== undefined && !strings(p.recipeIds, 2)) ||
        (p.rank !== undefined && (!integer(p.rank) || p.rank < 1 || p.rank > 3))
      )
        fail();
      return {
        id: p.id,
        ...(p.rank !== undefined ? { rank: p.rank } : {}),
        ...(p.recipeIds ? { recipeIds: [...p.recipeIds] } : {}),
      };
    });
  }
  if (Object.keys(d.acquisitions).length > 400) fail();
  for (const [id, entry] of Object.entries(d.acquisitions)) {
    if (!/^ability-[a-z0-9-]+$/.test(id) || !object(entry)) fail();
    const result = {};
    if (entry.weapon !== undefined) {
      if (!string(entry.weapon)) fail();
      result.weapon = entry.weapon;
    }
    if (entry.meleeHands !== undefined) {
      if (!integer(entry.meleeHands)) fail();
      result.meleeHands = entry.meleeHands;
    }
    if (entry.recipes !== undefined) {
      if (!strings(entry.recipes)) fail();
      result.recipes = [...entry.recipes];
    }
    draft.acquisitions[id] = result;
  }
  draft.shopping = d.shopping.map((p) => {
    if (
      !object(p) ||
      !string(p.id) ||
      !integer(p.quantity) ||
      p.quantity < 1 ||
      p.quantity > 10000 ||
      !integer(p.hands ?? 0)
    )
      fail();
    return { id: p.id, quantity: p.quantity, hands: p.hands ?? 0 };
  });
  if (d.profile !== undefined) {
    if (!object(d.profile)) fail();
    draft.profile = {};
    for (const key of ["pronouns", "player", "story"])
      if (d.profile[key] !== undefined) {
        if (!string(d.profile[key], key === "story" ? 10000 : 200)) fail();
        draft.profile[key] = d.profile[key];
      }
  }
  const preview = creationPreview(
    draft,
    catalogs.choices,
    catalogs.inventory,
    languages,
  );
  return { draft, preview };
}

export function writePortableCharacter(
  draft,
  catalogs,
  { ready = false, languages } = {},
) {
  const value = {
    format: PORTABLE_FORMAT,
    schemaVersion: PORTABLE_VERSION,
    sourceCommit: catalogs.commit,
    draft,
  };
  const normalized = readPortableCharacter(value, catalogs, languages);
  if (ready && !normalized.preview.valid)
    throw new Error(
      "Finish the choices in Review before exporting a ready character. You can save a draft at any time.",
    );
  return JSON.stringify(
    {
      ...value,
      status: normalized.preview.valid ? "ready" : "draft",
      draft: normalized.draft,
    },
    null,
    2,
  );
}
