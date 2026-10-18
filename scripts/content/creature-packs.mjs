import { createHash } from "node:crypto";
import { posix } from "node:path";
import { SYSTEM_ID } from "../../src/rules/item-construction.mjs";
import {
  stableFoundryId,
  validateStableCatalogIds,
} from "./item-packs.mjs";

export const CREATURE_PACK_DEFINITION = Object.freeze({
  name: "creatures",
  label: "Heroes of Legend Creatures",
  type: "Actor",
  path: "packs/creatures",
  directory: "creatures",
});
export const CREATURE_AUTOMATION_LABEL =
  "Printed profile · specialty automation pending";
export const CREATURE_FALLBACK_IMAGE = "icons/svg/mystery-man.svg";

const SOURCE_REPOSITORY = "bruceamoser/heroes-of-legend";
const SOURCE_REPOSITORY_URL = `https://github.com/${SOURCE_REPOSITORY}`;
const ATTRIBUTE_KEYS = [
  "brawn",
  "fortitude",
  "agility",
  "guile",
  "knowledge",
  "reason",
];
const SPEED_MODES = new Set(["burrow", "climb", "fly", "swim"]);
const SPECIAL_COVERAGE = "prose-preserved; native automation pending";

function fail(record, message) {
  throw new Error(`${record?.id ?? record?.source?.path ?? "creature"}: ${message}`);
}

function text(record, value, label) {
  if (typeof value !== "string")
    fail(record, `${label} must be a string`);
  return value;
}

function integer(
  record,
  value,
  label,
  { min = -Infinity, max = Infinity } = {},
) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail(record, `${label} must be an integer from ${min} through ${max}`);
  return value;
}

function array(record, value, label) {
  if (!Array.isArray(value))
    fail(record, `${label} must be an array`);
  return value;
}

function unique(record, values, label) {
  if (new Set(values).size !== values.length)
    fail(record, `${label} must be unique`);
}

function sourcePath(record, value, label) {
  text(record, value, label);
  if (
    !value ||
    value.startsWith("/") ||
    /[\\:%?#]/.test(value) ||
    value
      .split("/")
      .some((part) => !part || part === "." || part === "..")
  )
    fail(record, `${label} is unsafe`);
  return value;
}

function sourceUrl(path, commit) {
  const encoded = path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://github.com/${SOURCE_REPOSITORY}/blob/${commit}/${encoded}`;
}

export function rewriteSourceLinks(markdown, record, sourceCommit) {
  text(record, markdown, "Reference Markdown");
  return markdown.replace(
    /\[([^\]\n]+)\]\(([^)\s]+)\)/g,
    (original, label, target) => {
      if (/^(?:https?:|#)/i.test(target)) return original;
      if (target.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(target))
        fail(record, `Unsafe authored link: ${target}`);
      const hashIndex = target.indexOf("#");
      const relative = hashIndex < 0 ? target : target.slice(0, hashIndex);
      const hash = hashIndex < 0 ? "" : target.slice(hashIndex);
      const resolved = posix.normalize(
        posix.join(posix.dirname(record.source.path), relative),
      );
      if (
        !resolved.startsWith("design/") ||
        resolved
          .split("/")
          .some((part) => !part || part === "." || part === "..")
      )
        fail(record, `Authored link escapes the pinned source: ${target}`);
      return `[${label}](${sourceUrl(resolved, sourceCommit)}${hash})`;
    },
  );
}

function validateModifier(record, value, label) {
  integer(record, value?.boons, `${label} Boons`);
  integer(record, value?.banes, `${label} Banes`);
  text(record, value?.sourceText, `${label} source text`);
}

function validateMitigations(record, value, label) {
  const numeric = array(record, value?.numeric, `${label} numeric entries`);
  const special = array(record, value?.special, `${label} special entries`);
  text(record, value?.sourceText, `${label} source text`);
  for (const entry of numeric) {
    text(record, entry?.type, `${label} type`);
    integer(record, entry?.value, `${label} value`, { min: 0 });
    if (entry.value > 3) fail(record, `${label} value exceeds the rules cap`);
  }
  for (const entry of special) {
    text(record, entry?.type, `${label} special type`);
    if (entry?.reference !== "see details")
      fail(record, `${label} special reference must say "see details"`);
  }
  unique(
    record,
    numeric.map(({ type }) => type),
    `numeric ${label} types`,
  );
  unique(
    record,
    special.map(({ type }) => type),
    `special ${label} types`,
  );
}

export function creatureActionEntries(record, sourceCommit) {
  return [["main", "main"], ["maneuver", "maneuvers"], ["reaction", "reactions"]]
    .flatMap(([category, section]) => record.actions[section].actions.map((action, index) => {
      const attributeKey = action.defense?.attribute ?? "";
      if (category === "main" && !ATTRIBUTE_KEYS.includes(attributeKey))
        fail(record, `Unknown defense attribute for ${action.name}`);
      const outcomes = Object.fromEntries(["weak", "standard", "strong"].map(key => [
        key, action.outcomes ? text(record, action.outcomes[key], `${action.name} ${key}`) : "",
      ]));
      const detail = record.reference.specialtyDetails.find(entry =>
        entry.title.toLowerCase() === action.name.toLowerCase());
      if (category === "main" && action.name !== "Basic Melee" && !detail)
        fail(record, `Missing authored specialty reference for ${action.name}`);
      return {
        id: `${category}-${index}`, category, name: action.name,
        abilityId: record.abilitySources.find(source =>
          source.label.toLowerCase() === action.name.toLowerCase())?.id ?? "",
        attributeKey, defenseSource: action.defense?.sourceText ?? "",
        harmfulOnly: action.defense?.harmfulOnly ?? false,
        hasOutcomes: action.outcomes !== null && action.outcomes !== undefined,
        outcomes,
        effect: action.effect ?? action.damageSource ?? "",
        referenceMarkdown: detail ? rewriteSourceLinks(detail.markdown, record, sourceCommit) : "",
      };
    }));
}

function validateRecord(record, lock) {
  if (record?.kind !== "creature") fail(record, "Wrong catalog kind");
  text(record, record.id, "Catalog ID");
  text(record, record.name, "Name");
  if (record.id !== record.id.trim()) fail(record, "Catalog ID has whitespace");
  sourcePath(record, record.source?.path, "Source path");
  if (!/^[a-f0-9]{64}$/.test(record.source?.sha256))
    fail(record, "Source SHA-256 is invalid");
  if (record.source?.commit !== lock.commit)
    fail(record, "Source commit differs from the lock");
  const locked = lock.records.find(
    (candidate) => candidate.path === record.source.path,
  );
  if (
    !locked ||
    locked.id !== record.id ||
    locked.sha256 !== record.source.sha256
  )
    fail(record, "Source is not the pinned locked record");
  if (record.automation !== "pending")
    fail(record, "Catalog automation must remain pending");
  if (record.foundryId !== stableFoundryId(record.id))
    fail(record, "Catalog Foundry ID drifted");

  integer(record, record.cv, "CV");
  if (record.classification?.cv !== record.cv)
    fail(record, "Classification CV differs from the printed CV");
  text(record, record.family, "Family");
  text(record, record.classification?.category, "Classification category");
  text(record, record.classification?.role, "Classification role");
  for (const key of ATTRIBUTE_KEYS)
    integer(record, record.attributes?.[key], `Attribute ${key}`, {
      min: -2,
      max: 2,
    });
  text(record, record.attributesSource, "Attributes source text");
  integer(record, record.hp?.max, "Maximum HP", { min: 1 });
  text(record, record.hp?.sourceText, "HP source text");
  integer(record, record.speed?.ordinary, "Speed");
  text(record, record.speed?.sourceText, "Speed source text");
  for (const alternate of array(record, record.speed?.alternates, "Speeds")) {
    if (!SPEED_MODES.has(alternate?.mode))
      fail(record, `Unknown alternate Speed mode: ${alternate?.mode}`);
    integer(record, alternate.value, `${alternate.mode} Speed`);
  }
  integer(record, record.size?.value, "Size", { min: 1 });
  text(record, record.size?.label, "Size label");
  text(record, record.size?.sourceText, "Size source text");
  if (record.size.footprint) {
    integer(record, record.size.footprint.width, "Footprint width", { min: 1 });
    integer(record, record.size.footprint.height, "Footprint height", { min: 1 });
  }
  integer(record, record.armor?.dr, "Armor", { min: 0 });
  if (record.armor.dr > 3) fail(record, "Armor exceeds the rules cap");
  if (![null, "*"].includes(record.armor?.marker))
    fail(record, "Unknown Armor marker");
  text(record, record.armor?.sourceText, "Armor source text");
  integer(record, record.defenses?.stability, "Stability", { min: 0 });
  if (record.defenses.stability > 3)
    fail(record, "Stability exceeds the rules cap");
  validateModifier(record, record.defenses?.evasion, "Evasion");
  validateModifier(record, record.defenses?.threat, "Threat");
  validateMitigations(record, record.weaknesses, "Weakness");
  validateMitigations(record, record.resistances, "Resistance");
  const immunities = array(record, record.immunities, "Immunities");
  immunities.forEach((value) => text(record, value, "Immunity"));
  unique(record, immunities, "Immunities");
  for (const reference of array(
    record,
    record.abilitySources,
    "Ability sources",
  )) {
    sourcePath(record, reference?.path, "Ability source path");
    text(record, reference?.id, "Ability source ID");
    if (!/^[a-f0-9]{64}$/.test(reference?.sha256))
      fail(record, `Ability source hash is invalid: ${reference?.path}`);
    const locked = lock.records.find(
      (candidate) => candidate.path === reference.path,
    );
    if (
      !locked ||
      locked.id !== reference.id ||
      locked.sha256 !== reference.sha256
    )
      fail(record, `Ability source is not pinned: ${reference.path}`);
  }
  text(record, record.summoning?.sourceText, "Summoning source text");
  if (record.summoning.eligible) {
    text(record, record.summoning.summonId, "Summon ID");
    sourcePath(record, record.summoning.path, "Summon path");
    text(record, record.summoning.eligibility, "Summon eligibility");
    const link = lock.summonLinks.find(
      ({ creatureId }) => creatureId === record.id,
    );
    if (
      !link ||
      link.id !== record.summoning.summonId ||
      link.path !== record.summoning.path ||
      link.eligibility !== record.summoning.eligibility
    )
      fail(record, "Summoning metadata differs from the source lock");
  } else if (
    record.summoning?.summonId !== null ||
    record.summoning?.path !== null ||
    record.summoning?.eligibility !== null
  )
    fail(record, "Ineligible summoning metadata is not null");

  if (record.actions?.orientation !== "player-defense")
    fail(record, "Creature actions must retain player-defense orientation");
  for (const [section, actions] of [
    ["Main", record.actions?.main?.actions],
    ["Maneuver", record.actions?.maneuvers?.actions],
    ["Reaction", record.actions?.reactions?.actions],
  ]) {
    const entries = array(record, actions, `${section} actions`);
    if (!entries.length) fail(record, `${section} actions are empty`);
    for (const action of entries) {
      text(record, action?.name, `${section} action name`);
      if (action?.automation !== "pending")
        fail(record, `${section} action ${action.name} must remain pending`);
    }
  }
  text(record, record.actions?.introductionMarkdown, "Actions introduction");
  text(record, record.actions?.main?.markdown, "Main Actions Markdown");
  text(
    record,
    record.actions?.maneuvers?.markdown,
    "Maneuver Actions Markdown",
  );
  text(
    record,
    record.actions?.reactions?.markdown,
    "Reaction Actions Markdown",
  );
  const basic = record.actions.main.actions.filter(
    ({ name }) => name === "Basic Melee",
  );
  if (basic.length !== 1) fail(record, "Expected exactly one Basic Melee");
  for (const outcome of ["weak", "standard", "strong"]) {
    const value = basic[0].outcomes?.[outcome];
    if (typeof value !== "string" || !/^\d+$/.test(value))
      fail(record, `Basic Melee ${outcome} must be printed integer damage`);
    integer(record, Number(value), `Basic Melee ${outcome}`);
  }
  text(record, basic[0].defense?.attribute, "Basic Melee defense");
  if (!ATTRIBUTE_KEYS.includes(basic[0].defense.attribute))
    fail(record, "Basic Melee defense is not a creature attribute");

  const specialties = array(
    record,
    record.reference?.specialtyDetails,
    "Specialty details",
  );
  if (!specialties.length) fail(record, "Specialty details are empty");
  for (const detail of specialties) {
    text(record, detail?.title, "Specialty title");
    text(record, detail?.markdown, "Specialty Markdown");
    if (detail.coverage !== SPECIAL_COVERAGE)
      fail(record, `Specialty ${detail.title} must retain pending coverage`);
  }
  text(record, record.reference?.flavorMarkdown, "Flavor Markdown");
  text(
    record,
    record.reference?.generalDetailsMarkdown,
    "General details Markdown",
  );
  text(
    record,
    record.reference?.designNotesMarkdown,
    "Design notes Markdown",
  );
  return locked;
}

export function validateCreatureCatalogBasis({ catalog, lock }) {
  if (lock?.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(lock.commit))
    throw new Error("Creature source lock is invalid.");
  if (lock.repository !== SOURCE_REPOSITORY_URL)
    throw new Error("Creature source repository is not the expected book.");
  if (catalog?.schemaVersion !== 1)
    throw new Error("Unsupported creature catalog schema.");
  if (catalog.source?.repository !== lock.repository)
    throw new Error("Creature catalog repository differs from the source lock.");
  if (catalog.source?.commit !== lock.commit)
    throw new Error("Creature catalog and source lock revisions differ.");
  if (catalog.orientation?.creatureActionTables !== "player-defense")
    throw new Error("Creature catalog orientation is not player-defense.");
  const creatures = array(catalog, catalog.creatures, "Creature catalog");
  if (creatures.length !== 192 || catalog.counts?.creatures !== 192)
    throw new Error(
      `Expected 192 creatures; found ${creatures.length} catalog records and ${catalog.counts?.creatures ?? 0} counted.`,
    );
  unique(
    { source: { path: "creature-catalog" } },
    creatures.map(({ id }) => id),
    "Creature catalog IDs",
  );
  validateStableCatalogIds(creatures);
  creatures.forEach((record) => validateRecord(record, lock));
  return creatures;
}

export function creatureReferenceMarkdown(record, sourceCommit) {
  const source = record.source.path;
  const specialty = record.reference.specialtyDetails
    .map(({ markdown }) => markdown)
    .join("\n\n");
  return [
    rewriteSourceLinks(record.reference.flavorMarkdown, record, sourceCommit),
    "## Actions",
    rewriteSourceLinks(
      record.actions.introductionMarkdown,
      record,
      sourceCommit,
    ),
    "### Main Actions",
    rewriteSourceLinks(record.actions.main.markdown, record, sourceCommit),
    "### Maneuvers",
    rewriteSourceLinks(
      record.actions.maneuvers.markdown,
      record,
      sourceCommit,
    ),
    "### Reactions",
    rewriteSourceLinks(
      record.actions.reactions.markdown,
      record,
      sourceCommit,
    ),
    "## Details",
    rewriteSourceLinks(specialty, record, sourceCommit),
    rewriteSourceLinks(
      record.reference.generalDetailsMarkdown,
      record,
      sourceCommit,
    ),
    rewriteSourceLinks(
      record.reference.designNotesMarkdown,
      record,
      sourceCommit,
    ),
    `**Source:** [${source}](${sourceUrl(source, sourceCommit)}) at \`${sourceCommit}\`.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function basicMelee(record) {
  const action = record.actions.main.actions.find(
    ({ name }) => name === "Basic Melee",
  );
  return {
    weak: Number(action.outcomes.weak),
    standard: Number(action.outcomes.standard),
    strong: Number(action.outcomes.strong),
    defenseAttribute: action.defense.attribute,
    orientation: "player-defense",
  };
}

function actorSystem(record, sourceCommit) {
  const footprint = record.size.footprint ?? {
    width: record.size.value,
    height: record.size.value,
  };
  return {
    schemaVersion: 1,
    attributes: Object.fromEntries(
      Object.entries(record.attributes).map(([key, base]) => [key, { base }]),
    ),
    attributesSource: record.attributesSource,
    health: {
      value: record.hp.max,
      baseMax: record.hp.max,
      sourceText: record.hp.sourceText,
    },
    cv: record.cv,
    speed: record.speed.ordinary,
    speedSource: record.speed.sourceText,
    alternateSpeeds: structuredClone(record.speed.alternates),
    size: record.size.value,
    sizeLabel: record.size.label,
    sizeSource: record.size.sourceText,
    footprint: structuredClone(footprint),
    armor: record.armor.dr,
    armorMarker: record.armor.marker ?? "",
    armorSource: record.armor.sourceText,
    stability: record.defenses.stability,
    threat: structuredClone(record.defenses.threat),
    evasion: structuredClone(record.defenses.evasion),
    weaknesses: structuredClone(record.weaknesses),
    resistances: structuredClone(record.resistances),
    immunities: structuredClone(record.immunities),
    basicMelee: basicMelee(record),
    actions: {
      orientation: record.actions.orientation,
      entries: creatureActionEntries(record, sourceCommit),
      introductionMarkdown: rewriteSourceLinks(
        record.actions.introductionMarkdown,
        record,
        sourceCommit,
      ),
      mainMarkdown: rewriteSourceLinks(
        record.actions.main.markdown,
        record,
        sourceCommit,
      ),
      maneuverMarkdown: rewriteSourceLinks(
        record.actions.maneuvers.markdown,
        record,
        sourceCommit,
      ),
      reactionMarkdown: rewriteSourceLinks(
        record.actions.reactions.markdown,
        record,
        sourceCommit,
      ),
    },
    details: {
      flavorMarkdown: rewriteSourceLinks(
        record.reference.flavorMarkdown,
        record,
        sourceCommit,
      ),
      specialtyMarkdown: rewriteSourceLinks(
        record.reference.specialtyDetails
          .map(({ markdown }) => markdown)
          .join("\n\n"),
        record,
        sourceCommit,
      ),
      generalMarkdown: rewriteSourceLinks(
        record.reference.generalDetailsMarkdown,
        record,
        sourceCommit,
      ),
      designNotesMarkdown: rewriteSourceLinks(
        record.reference.designNotesMarkdown,
        record,
        sourceCommit,
      ),
    },
    biography: "",
  };
}

export function creatureActorSource(record, { sourceCommit, portrait, abilityTemplates = [] }) {
  if (!/^[a-f0-9]{40}$/.test(sourceCommit))
    throw new Error("Creature actor source commit is invalid.");
  return {
    name: record.name,
    type: "creature",
    img: portrait.img,
    prototypeToken: { ...structuredClone(record.size.footprint ?? {
      width: record.size.value,
      height: record.size.value,
    }), texture: { src: portrait.img } },
    system: actorSystem(record, sourceCommit),
    flags: {
      [SYSTEM_ID]: {
        portrait: structuredClone(portrait.provenance),
        catalogId: record.id,
        source: {
          path: record.source.path,
          sha256: record.source.sha256,
        },
        sourceCommit,
        catalogAutomation: record.automation,
        automation: "pending",
        automationLabel: CREATURE_AUTOMATION_LABEL,
        specialtyAutomation: "pending",
        classification: structuredClone(record.classification),
        family: record.family,
        abilitySources: structuredClone(record.abilitySources),
        monsterAbilityTemplates: structuredClone(abilityTemplates),
        summoning: structuredClone(record.summoning),
      },
    },
  };
}

function authoredCreatureDocument(record, id, sourceCommit, portrait, abilityTemplates) {
  if (!/^[a-f0-9]{16}$/.test(id))
    throw new Error(`Invalid Foundry Actor ID: ${id}`);
  const actor = creatureActorSource(record, { sourceCommit, portrait, abilityTemplates });
  return {
    _key: `!actors!${id}`,
    _id: id,
    name: actor.name,
    type: actor.type,
    img: actor.img,
    prototypeToken: actor.prototypeToken,
    system: actor.system,
    items: [],
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: actor.flags,
  };
}

function semanticHash(documents) {
  return createHash("sha256")
    .update(JSON.stringify(documents))
    .digest("hex");
}

function serializedDocument(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function buildCreaturePackArtifacts({ catalog, lock, portraits }) {
  const templates = new Map((catalog.monsterAbilities ?? []).map(template => [template.id, template]));
  if (templates.size !== lock.counts.monsterAbilities)
    throw new Error("Monster ability template count differs from source lock");
  for (const template of templates.values()) {
    const locked = lock.records.find(record => record.id === template.id);
    if (!locked || locked.path !== template.source.path || locked.sha256 !== template.source.sha256 ||
        template.source.commit !== lock.commit || !template.rulesMarkdown || !template.flavorMarkdown)
      throw new Error(`Monster ability template differs from source lock: ${template.id}`);
  }
  const creatures = validateCreatureCatalogBasis({ catalog, lock })
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id, "en"));
  const identities = validateStableCatalogIds(creatures);
  const identityById = new Map(
    identities.map(({ id, foundryId }) => [id, foundryId]),
  );
  const documents = creatures.map((record) =>
    authoredCreatureDocument(
      record,
      identityById.get(record.id),
      lock.commit,
      portraits.get(record.id),
      record.abilitySources.map(source => {
        const template = templates.get(source.id);
        if (!template) throw new Error(`Missing monster ability template: ${source.id}`);
        return template;
      }),
    ),
  );
  const files = new Map();
  for (const document of documents)
    files.set(
      `creatures/${document.flags[SYSTEM_ID].catalogId}.json`,
      serializedDocument(document),
    );
  return {
    files,
    definition: CREATURE_PACK_DEFINITION,
    pack: {
      name: CREATURE_PACK_DEFINITION.name,
      type: CREATURE_PACK_DEFINITION.type,
      path: CREATURE_PACK_DEFINITION.path,
      count: documents.length,
      semanticSha256: semanticHash(documents),
    },
    documents: { creatures: documents },
  };
}
