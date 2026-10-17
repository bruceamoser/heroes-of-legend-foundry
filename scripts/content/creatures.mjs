import { createHash } from "node:crypto";
import { posix } from "node:path";

const ATTRIBUTE_KEYS = [
  "brawn",
  "fortitude",
  "agility",
  "guile",
  "knowledge",
  "reason",
];
const ATTRIBUTE_NAMES = new Map(
  ATTRIBUTE_KEYS.map((key) => [key[0].toUpperCase() + key.slice(1), key]),
);
const MAIN_HEADER = "| Main Actions | Defense | Damage |";
const MANEUVER_HEADER = "| Maneuvers | Effect |";
const REACTION_HEADER = "| Reactions | Effect |";
const REQUIRED_GENERAL_FIELDS = [
  "Basic Melee",
  "Defend",
  "Opportunity Attack",
  "Healing",
  "Senses",
  "Tactics and retreat",
  "Habitat",
  "Loot",
  "Summoning",
];

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

function expectMatch(text, regex, path, label) {
  const match = text.match(regex);
  if (!match) fail(path, `Unknown or missing ${label}`);
  return match;
}

function uniqueLine(text, prefix, path, label) {
  const lines = text.split("\n").filter((line) => line.startsWith(prefix));
  if (lines.length !== 1)
    fail(path, `Expected one ${label} line, found ${lines.length}`);
  return lines[0];
}

function assertUnique(values, path, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail(path, `Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

export function verifySourceHash(source, bytes) {
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== source.sha256)
    fail(
      source.path,
      `Source hash mismatch; expected ${source.sha256}, received ${actual}`,
    );
  return bytes;
}

export function foundryIdFor(id) {
  return createHash("sha256")
    .update(`heroes-of-legend:${id}`)
    .digest("hex")
    .slice(0, 16);
}

function parseAttributes(sourceText, path) {
  const attributes = {};
  const parts = sourceText.split("; ");
  if (parts.length !== ATTRIBUTE_KEYS.length)
    fail(path, "Attribute table must contain six entries");
  for (const part of parts) {
    const match = part.match(/^([A-Za-z]+) ([+-]\d+)$/);
    if (!match) fail(path, `Unknown attribute format: ${part}`);
    const key = ATTRIBUTE_NAMES.get(match[1]);
    if (!key || key in attributes)
      fail(path, `Unknown or duplicate attribute: ${match[1]}`);
    attributes[key] = Number(match[2]);
  }
  if (ATTRIBUTE_KEYS.some((key) => !(key in attributes)))
    fail(path, "Attribute table is incomplete");
  return attributes;
}

function parseSpeed(sourceText, path) {
  const match = sourceText.match(/^(\d+)(?:; (.+))?$/);
  if (!match) fail(path, `Unknown Speed format: ${sourceText}`);
  const ordinary = Number(match[1]);
  const alternates = [];
  if (match[2]) {
    for (const part of match[2].split("; ")) {
      const alternate = part.match(/^(burrow|climb|fly|swim) (\d+)$/);
      if (!alternate)
        fail(path, `Unknown alternate Speed format: ${sourceText}`);
      alternates.push({
        mode: alternate[1],
        value: Number(alternate[2]),
      });
    }
    assertUnique(
      alternates.map(({ mode }) => mode),
      path,
      "alternate Speed mode",
    );
  }
  return { ordinary, alternates, sourceText };
}

function parseSize(sourceText, path) {
  const match = sourceText.match(/^(\d+) \(([^)]+)\)$/);
  if (!match) fail(path, `Unknown Size format: ${sourceText}`);
  const label = match[2];
  const footprintMatch = label.match(/^(\d+)x(\d+) squares$/);
  if (label !== "medium" && !footprintMatch)
    fail(path, `Unknown Size label: ${sourceText}`);
  if (footprintMatch && Number(footprintMatch[1]) !== Number(match[1]))
    fail(path, `Size value and footprint width disagree: ${sourceText}`);
  return {
    value: Number(match[1]),
    label,
    footprint: footprintMatch
      ? {
          width: Number(footprintMatch[1]),
          height: Number(footprintMatch[2]),
        }
      : null,
    sourceText,
  };
}

function parseArmor(sourceText, path) {
  const match = sourceText.match(/^(\d+)(\\\*)?$/);
  if (!match) fail(path, `Unknown Armor DR format: ${sourceText}`);
  return {
    dr: Number(match[1]),
    marker: match[2] ? "*" : null,
    sourceText,
  };
}

function parseBoonBane(sourceText, path, label) {
  if (sourceText === "None")
    return { boons: 0, banes: 0, sourceText };
  const match = sourceText.match(/^(\d+) (Boon|Bane)s?$/);
  if (!match) fail(path, `Unknown ${label} format: ${sourceText}`);
  const amount = Number(match[1]);
  const singular = match[2];
  const expected = amount === 1 ? singular : `${singular}s`;
  if (sourceText !== `${amount} ${expected}`)
    fail(path, `Unknown ${label} pluralization: ${sourceText}`);
  return {
    boons: singular === "Boon" ? amount : 0,
    banes: singular === "Bane" ? amount : 0,
    sourceText,
  };
}

function parseMitigations(sourceText, path, label) {
  if (sourceText === "None")
    return { numeric: [], special: [], sourceText };
  const numeric = [],
    special = [];
  for (const entry of sourceText.split(", ")) {
    const match = entry.match(/^([^()]+) \((\d+|see details)\)$/);
    if (!match) fail(path, `Unknown ${label} format: ${entry}`);
    const type = match[1].trim();
    if (!type) fail(path, `Missing ${label} type: ${entry}`);
    if (match[2] === "see details") special.push({ type, reference: match[2] });
    else numeric.push({ type, value: Number(match[2]) });
  }
  assertUnique(
    numeric.map(({ type }) => type),
    path,
    `numeric ${label} type`,
  );
  assertUnique(
    special.map(({ type }) => type),
    path,
    `special ${label} type`,
  );
  return { numeric, special, sourceText };
}

function parseImmunities(sourceText, path) {
  if (sourceText === "None") return [];
  const values = sourceText.split("; ");
  if (values.some((value) => !value)) fail(path, "Empty immunity entry");
  assertUnique(values, path, "immunity");
  return values;
}

function splitRow(line, columns, path, table) {
  if (!line.startsWith("| ") || !line.endsWith(" |"))
    fail(path, `Malformed ${table} row: ${line}`);
  const cells = line
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
  if (cells.length !== columns)
    fail(path, `${table} row has ${cells.length} cells, expected ${columns}`);
  return cells;
}

function parseTable(markdown, header, columns, path, table) {
  const lines = markdown.split("\n");
  if (lines[0] !== header)
    fail(path, `Unknown ${table} header: ${lines[0] ?? "<missing>"}`);
  if (lines[1] !== `|${"---|".repeat(columns)}`)
    fail(path, `Malformed ${table} separator`);
  if (lines.length < 3) fail(path, `${table} has no rows`);
  const rows = lines
    .slice(2)
    .map((line) => splitRow(line, columns, path, table));
  assertUnique(
    rows.map(([name]) => name),
    path,
    `${table} action`,
  );
  return { header, rows, markdown };
}

function parseDefense(sourceText, path) {
  const match = sourceText.match(/^([A-Za-z]+)(?: \(if harmful\))?$/);
  if (!match) fail(path, `Unknown Defense format: ${sourceText}`);
  const attribute = ATTRIBUTE_NAMES.get(match[1]);
  if (!attribute) fail(path, `Unknown Defense attribute: ${match[1]}`);
  return {
    attribute,
    harmfulOnly: sourceText.endsWith("(if harmful)"),
    sourceText,
  };
}

function parseActions(section, path) {
  const blocks = section.trim().split(/\n\n+/);
  const tableIndexes = [];
  const tables = [];
  for (const [index, block] of blocks.entries()) {
    if (!block.startsWith("|")) continue;
    tableIndexes.push(index);
    tables.push(block);
  }
  if (tables.length !== 3)
    fail(path, `Expected three action tables, found ${tables.length}`);
  if (tableIndexes[0] === 0) fail(path, "Missing action-table introduction");
  const nonTableTail = blocks
    .slice(tableIndexes[0])
    .filter((block) => !block.startsWith("|"));
  if (nonTableTail.length)
    fail(path, `Unknown content between action tables: ${nonTableTail[0]}`);

  const main = parseTable(tables[0], MAIN_HEADER, 3, path, "Main Actions");
  const maneuvers = parseTable(
    tables[1],
    MANEUVER_HEADER,
    2,
    path,
    "Maneuvers",
  );
  const reactions = parseTable(
    tables[2],
    REACTION_HEADER,
    2,
    path,
    "Reactions",
  );
  return {
    orientation: "player-defense",
    introductionMarkdown: blocks.slice(0, tableIndexes[0]).join("\n\n"),
    main: {
      ...main,
      actions: main.rows.map(([name, defenseText, damageText]) => {
        let outcomes = null;
        if (damageText !== "See details") {
          const parts = damageText.split(/\s*\/\s*/);
          if (parts.length !== 3 || parts.some((part) => !part))
            fail(
              path,
              `Unknown player-defense outcome format for ${name}: ${damageText}`,
            );
          outcomes = {
            weak: parts[0],
            standard: parts[1],
            strong: parts[2],
          };
        }
        return {
          name,
          defense: parseDefense(defenseText, path),
          damageSource: damageText,
          outcomes,
          coverage:
            damageText === "See details"
              ? "detail-reference"
              : "structured-player-defense",
          automation: "pending",
        };
      }),
    },
    maneuvers: {
      ...maneuvers,
      actions: maneuvers.rows.map(([name, effect]) => ({
        name,
        effect,
        automation: "pending",
      })),
    },
    reactions: {
      ...reactions,
      actions: reactions.rows.map(([name, effect]) => ({
        name,
        effect,
        automation: "pending",
      })),
    },
  };
}

function parseFields(markdown, path, sectionTitle) {
  const markers = [...markdown.matchAll(/\*\*([^*\n]+):\*\* /g)];
  if (!markers.length) return [];
  const fields = markers.map((marker, index) => {
    const labelSource = marker[1];
    const [label, ...qualifierParts] = labelSource.split(" — ");
    const valueStart = marker.index + marker[0].length;
    const valueEnd = markers[index + 1]?.index ?? markdown.length;
    const sourceText = markdown
      .slice(valueStart, valueEnd)
      .trim()
      .replace(/\s*·$/, "");
    if (!label || !sourceText)
      fail(path, `${sectionTitle} has an empty field: ${labelSource}`);
    return {
      label,
      qualifier: qualifierParts.length ? qualifierParts.join(" — ") : null,
      text: sourceText,
    };
  });
  assertUnique(
    fields.map(({ label, qualifier }) => `${label}\0${qualifier ?? ""}`),
    path,
    `${sectionTitle} detail field`,
  );
  return fields;
}

function fieldMap(fields, path, sectionTitle) {
  const map = new Map();
  for (const field of fields) {
    if (field.qualifier) continue;
    if (map.has(field.label))
      fail(path, `Duplicate ${sectionTitle} field: ${field.label}`);
    map.set(field.label, field);
  }
  return map;
}

function parseDetails(sourceText, path) {
  const headings = [...sourceText.matchAll(/^### ([^\n]+)$/gm)];
  if (!headings.length) fail(path, "Missing creature detail sections");
  if (headings[0].index !== 0)
    fail(path, "Unknown content before the first creature detail section");
  const ordinary = headings.filter((heading) => heading[1] === "General details");
  if (ordinary.length !== 1)
    fail(path, `Expected one General details section, found ${ordinary.length}`);
  if (headings.at(-1)[1] !== "General details")
    fail(path, "General details must be the final detail section");
  assertUnique(
    headings.map((heading) => heading[1]),
    path,
    "detail section",
  );
  const sections = headings.map((heading, index) => {
    const end = headings[index + 1]?.index ?? sourceText.length;
    const markdown = sourceText.slice(heading.index, end).trimEnd();
    const body = markdown.slice(heading[0].length).trim();
    return {
      title: heading[1],
      markdown,
      fields: parseFields(body, path, heading[1]),
    };
  });
  return {
    specialty: sections
      .filter(({ title }) => title !== "General details")
      .map((section) => ({
        ...section,
        coverage: "prose-preserved; native automation pending",
      })),
    general: sections.at(-1),
  };
}

function parseSummoning(field, record, context, path) {
  if (!field) fail(path, "Missing Summoning field");
  if (/^Ineligible\.$/.test(field.text)) {
    if (context.summonLink)
      fail(path, "Ineligible creature has a summon link");
    return {
      eligible: false,
      summonId: null,
      path: null,
      eligibility: null,
      sourceText: field.text,
    };
  }
  const match = field.text.match(
    /^(.+?) — \[player reference\]\(\.\.\/summons\/([a-z0-9-]+)\.md\)\.$/,
  );
  if (!match) fail(path, `Unknown Summoning format: ${field.text}`);
  const summonPath = `design/bestiary/summons/${match[2]}.md`;
  if (!context.summonLink)
    fail(path, `Missing source-lock summon link for ${summonPath}`);
  if (
    context.summonLink.id !== `summon-${record.id.slice("creature-".length)}` ||
    context.summonLink.creatureId !== record.id ||
    context.summonLink.source?.path !== summonPath ||
    context.summonLink.eligibility !== match[1] ||
    context.summonLink.perspective !== "attacker"
  )
    fail(
      path,
      `Summoning field disagrees with source-lock link: ${context.summonLink.id} ${context.summonLink.source?.path} ${context.summonLink.eligibility}`,
    );
  return {
    eligible: true,
    summonId: context.summonLink.id,
    path: summonPath,
    eligibility: match[1],
    sourceText: field.text,
  };
}

function parseAbilitySources(designNotes, record, context, path) {
  const lines = designNotes
    .split("\n")
    .filter((line) => line.startsWith("**Ability sources:**"));
  if (lines.length > 1) fail(path, "Duplicate Ability sources line");
  if (!lines.length) return [];
  const line = lines[0].replace(/^\*\*Ability sources:\*\* /, "");
  const links = [...line.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
  if (
    (line.match(/\]\(/g) ?? []).length !== links.length ||
    links.length === 0
  )
    fail(path, "Malformed Ability sources links");
  const abilityRecords = new Map(
    (context.abilityRecords ?? []).map((ability) => [ability.path, ability]),
  );
  const references = links.map((link) => {
    const target = posix.normalize(posix.join(posix.dirname(record.path), link[2]));
    if (!target.startsWith("design/monster-abilities/"))
      fail(path, `Ability source escapes monster-abilities: ${link[2]}`);
    const source = abilityRecords.get(target);
    if (!source)
      fail(path, `Missing or unlocked monster ability: ${target}`);
    return {
      label: link[1],
      id: source.id,
      path: source.path,
      sha256: source.sha256,
    };
  });
  assertUnique(
    references.map(({ id }) => id),
    path,
    "ability-source ID",
  );
  return references;
}

function copyPortrait(record, context, path) {
  const portrait = context.portrait;
  if (!portrait) fail(path, "Missing portrait metadata");
  if (portrait.id !== record.id)
    fail(path, `Portrait ID mismatch: ${portrait.id}`);
  if (!portrait.name) fail(path, "Portrait name is missing");
  if (!portrait.path || !portrait.sha256)
    fail(path, "Portrait path or hash is missing");
  if (!portrait.provenance) fail(path, "Portrait provenance is missing");
  return {
    id: portrait.id,
    name: portrait.name,
    path: portrait.path,
    sha256: portrait.sha256,
    width: portrait.width,
    height: portrait.height,
    alpha: portrait.alpha,
    status: portrait.status,
    promptId: portrait.promptId,
    provenance: portrait.provenance,
    generatedSource: portrait.generatedSource ?? null,
  };
}

export function parseCreature(record, text, context) {
  const path = record.path;
  if (!record.id) fail(path, "Source-lock creature has no stable ID");
  if (!context?.commit) fail(path, "Missing source commit");
  if (!context.family) fail(path, "Missing DA source-manifest family");

  const header = expectMatch(
    text,
    /^# ([^\n]+) \(CV (-?\d+)\)\n\n([\s\S]*?)\n\n\*\*Attributes:\*\* ([^\n]+)\n/,
    path,
    "creature heading, flavor, or attributes",
  );
  const name = header[1];
  const cv = Number(header[2]);
  const flavorMarkdown = header[3];
  const attributes = parseAttributes(header[4], path);

  const armorLine = uniqueLine(text, "**HP:** ", path, "HP");
  const itemStats = expectMatch(
    armorLine,
    /^\*\*HP:\*\* (\d+) · \*\*Speed:\*\* ([^·\n]+) · \*\*Size:\*\* ([^·\n]+) · \*\*Armor DR:\*\* ([^\n]+)$/,
    path,
    "HP, Speed, Size, or Armor DR",
  );
  const hp = Number(itemStats[1]);
  const speed = parseSpeed(itemStats[2].trim(), path);
  const size = parseSize(itemStats[3].trim(), path);
  const armor = parseArmor(itemStats[4].trim(), path);

  const defenseLine = uniqueLine(text, "**Evasion:** ", path, "defenses");
  const defenses = expectMatch(
    defenseLine,
    /^\*\*Evasion:\*\* ([^·\n]+) · \*\*Threat:\*\* ([^·\n]+) · \*\*Stability:\*\* (\d+)$/,
    path,
    "Evasion, Threat, or Stability",
  );
  const stability = Number(defenses[3]);

  const weaknessesSource = uniqueLine(
    text,
    "**Weaknesses:** ",
    path,
    "Weaknesses",
  )
    .replace(/^\*\*Weaknesses:\*\* /, "")
    .replace(/\\$/, "");
  const resistancesSource = uniqueLine(
    text,
    "**Resistances:** ",
    path,
    "Resistances",
  )
    .replace(/^\*\*Resistances:\*\* /, "")
    .replace(/\\$/, "");
  const immunitiesSource = uniqueLine(
    text,
    "**Immunities:** ",
    path,
    "Immunities",
  ).replace(/^\*\*Immunities:\*\* /, "");

  const sections = expectMatch(
    text,
    /^## Actions\n\n([\s\S]*?)\n\n## Details\n\n([\s\S]*?)\n\n## Design notes — not needed during play\n\n([\s\S]*)$/m,
    path,
    "Actions, Details, or Design notes sections",
  );
  const actions = parseActions(sections[1], path);
  const parsedDetails = parseDetails(sections[2], path);
  const generalFields = parsedDetails.general.fields;
  const general = fieldMap(generalFields, path, "General details");
  for (const label of REQUIRED_GENERAL_FIELDS) {
    if (!general.has(label)) fail(path, `Missing General details field: ${label}`);
  }
  if (
    !general.has("Purpose") &&
    !general.has("Encounter and conversation")
  )
    fail(path, "Missing Purpose or Encounter and conversation");

  const idLine = uniqueLine(text, "**ID:** ", path, "ID").replace(
    /^\*\*ID:\*\* /,
    "",
  );
  if (idLine !== record.id)
    fail(path, `Authored ID ${idLine} differs from lock ID ${record.id}`);

  const classification = expectMatch(
    sections[3],
    /^\*\*Category:\*\* (.+) · \*\*Role:\*\* (.+) · \*\*CV:\*\* (-?\d+)$/m,
    path,
    "Category, Role, or CV",
  );
  if (Number(classification[3]) !== cv)
    fail(path, "Title CV and design-notes CV differ");

  const summoning = parseSummoning(general.get("Summoning"), record, context, path);
  const abilitySources = parseAbilitySources(
    sections[3],
    record,
    context,
    path,
  );
  const portrait = copyPortrait(record, context, path);
  if (portrait.name !== name)
    fail(path, `Portrait name ${portrait.name} differs from creature name ${name}`);

  for (const action of actions.main.actions) {
    if (
      action.name !== "Basic Melee" &&
      !parsedDetails.specialty.some(({ title }) => title === action.name)
    )
      fail(path, `Main action ${action.name} has no authored detail section`);
  }

  const designNotesMarkdown = `## Design notes — not needed during play\n\n${sections[3].trimEnd()}`;
  return {
    id: record.id,
    foundryId: foundryIdFor(record.id),
    kind: "creature",
    name,
    cv,
    family: context.family,
    classification: {
      category: classification[1].trim(),
      role: classification[2].trim(),
      cv: Number(classification[3]),
    },
    source: {
      commit: context.commit,
      path: record.path,
      sha256: record.sha256,
    },
    portrait,
    attributes,
    attributesSource: header[4],
    hp: {
      max: hp,
      sourceText: itemStats[1],
    },
    speed,
    size,
    armor,
    defenses: {
      evasion: parseBoonBane(defenses[1].trim(), path, "Evasion"),
      threat: parseBoonBane(defenses[2].trim(), path, "Threat"),
      stability,
    },
    weaknesses: parseMitigations(weaknessesSource, path, "Weakness"),
    resistances: parseMitigations(resistancesSource, path, "Resistance"),
    immunities: parseImmunities(immunitiesSource, path),
    summoning,
    abilitySources,
    actions,
    reference: {
      flavorMarkdown,
      specialtyDetails: parsedDetails.specialty,
      generalDetailsMarkdown: parsedDetails.general.markdown,
      generalFields,
      designNotesMarkdown,
    },
    automation: "pending",
  };
}

export function summarizeCreatureCatalog(creatures, summonLinks) {
  return {
    creatures: creatures.length,
    portraits: creatures.filter(({ portrait }) => portrait).length,
    summonLinks: summonLinks.length,
    mainActions: creatures.reduce(
      (sum, creature) => sum + creature.actions.main.actions.length,
      0,
    ),
    maneuvers: creatures.reduce(
      (sum, creature) => sum + creature.actions.maneuvers.actions.length,
      0,
    ),
    reactions: creatures.reduce(
      (sum, creature) => sum + creature.actions.reactions.actions.length,
      0,
    ),
    specialtyDetails: creatures.reduce(
      (sum, creature) => sum + creature.reference.specialtyDetails.length,
      0,
    ),
    abilitySources: creatures.reduce(
      (sum, creature) => sum + creature.abilitySources.length,
      0,
    ),
  };
}
