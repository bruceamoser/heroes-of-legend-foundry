import { createHash } from "node:crypto";

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
const REQUIRED_FIELDS = [
  "Attributes",
  "HP",
  "Defense modifier",
  "DR / resistance",
  "Weakness",
  "Healing",
  "Senses",
  "Communication",
  "Eligibility",
  "Carrying",
];
const ATTACK_HEADER =
  "| Attack | Attribute | Attack modifier | Weak attack | Standard attack | Strong attack |";
const ATTACK_SEPARATOR = "|---|---|---|---|---|---|";
const SUMMONED_REFERENCE = "**Summoned form — player reference.**";
const ATTACK_INTRODUCTION =
  "Roll its printed attack attribute and read the attacker outcomes below. When it is attacked, roll the defense attribute named by the incoming attack. Passive defenses remain; no independent active effects.";
const ANCHOR_NOTE = "Summoned form has no letter anchor or Anchor Bound.";
const DEFEND_TEXT = {
  "start-of-turn":
    "gain 1 Boon to defenses until the start of the controller’s next turn; repeated Defend does not stack.",
  "controller-turn":
    "Gain 1 Boon to defenses until the controller’s next turn; repeated Defend does not stack.",
};
const COMMAND_TEXTS = new Set([
  "Main command: Main + Maneuver; Maneuver command: Maneuver + movement. One command per summon per controller turn; immediate summoning command counts. No activity or alerts without a command; no Reactions or opportunity attacks. Turn ticks use controller’s turn. Beyond 6 squares, or controller unconscious/dead, it disappears; at 0 HP it disappears. No permanent loot.",
  "Main command: Main + Maneuver; Maneuver command: Maneuver + movement. One command per summon per controller turn; immediate summoning command counts. No activity or alerts without a command; no Reactions or opportunity attacks. Turn ticks use the controller’s turn. Beyond 6 squares, or if the controller is unconscious/dead, it disappears; at 0 HP it disappears. No permanent loot. No summon chains.",
]);
const BASIC_MELEE_TARGET = "one adjacent target";
const SUMMON_RULES_PATH = "design/rules/summoning.md";

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

function expectMatch(text, regex, path, label) {
  const match = text.match(regex);
  if (!match) fail(path, `Unknown or missing ${label}`);
  return match;
}

function assertUnique(values, path, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail(path, `Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function blocks(markdown) {
  return markdown
    .trim()
    .split(/\n[ \t]*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
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

function parseSpeed(sourceText, path) {
  const [ordinaryText, ...alternateTexts] = sourceText.split("; ");
  const ordinaryMatch = ordinaryText.match(/^(?:Ground )?(\d+)$/);
  if (!ordinaryMatch) fail(path, `Unknown ordinary Speed format: ${sourceText}`);
  const alternates = alternateTexts.map((entry) => {
    const match = entry.match(/^(burrow|climb|fly|swim) (\d+)$/);
    if (!match) fail(path, `Unknown alternate Speed format: ${sourceText}`);
    return {
      mode: match[1],
      value: Number(match[2]),
      sourceText: entry,
    };
  });
  assertUnique(
    alternates.map(({ mode }) => mode),
    path,
    "alternate Speed mode",
  );
  return {
    ordinary: {
      mode: "ground",
      value: Number(ordinaryMatch[1]),
      sourceText: ordinaryText,
    },
    alternates,
    sourceText,
  };
}

function parseFootprint(sourceText, path) {
  const match = sourceText.match(/^(\d+)x(\d+)$/);
  if (!match) fail(path, `Unknown Footprint format: ${sourceText}`);
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 1 || height < 1)
    fail(path, `Footprint dimensions must be positive: ${sourceText}`);
  return { width, height, sourceText };
}

function parseResistances(sourceText, path) {
  if (sourceText === "None")
    return {
      ordinary: [],
      special: [],
      sourceText,
    };
  const ordinary = [];
  const special = [];
  for (const [index, entry] of sourceText.split("; ").entries()) {
    const match = entry.match(/^(.+?) (\d+)$/);
    if (match) {
      const type = match[1].trim();
      if (!type) fail(path, `Missing resistance type: ${entry}`);
      ordinary.push({
        kind: "ordinary",
        type,
        value: Number(match[2]),
        sourceText: entry,
      });
    } else {
      special.push({
        kind: "special",
        reference: `resistance-special-${index + 1}`,
        sourceText: entry,
      });
    }
  }
  assertUnique(
    ordinary.map(({ type }) => type.toLowerCase()),
    path,
    "resistance type",
  );
  assertUnique(
    special.map(({ sourceText }) => sourceText),
    path,
    "special resistance reference",
  );
  return { ordinary, special, sourceText };
}

function parseWeakness(sourceText, path) {
  if (sourceText === "None")
    return {
      ordinary: [],
      special: [],
      sourceText,
    };
  const ordinary = [];
  const entries = sourceText.split("; ");
  for (const entry of entries) {
    const match = entry.match(/^(.+?) \((\d+)\)$/);
    if (!match) {
      return {
        ordinary: [],
        special: [
          {
            kind: "special",
            reference: "weakness-special-1",
            sourceText,
          },
        ],
        sourceText,
      };
    }
    const type = match[1].trim();
    if (!type) fail(path, `Missing weakness type: ${entry}`);
    ordinary.push({
      kind: "ordinary",
      type,
      value: Number(match[2]),
      sourceText: entry,
    });
  }
  assertUnique(
    ordinary.map(({ type }) => type.toLowerCase()),
    path,
    "weakness type",
  );
  return { ordinary, special: [], sourceText };
}

function parseImmunities(sourceText, path) {
  if (sourceText === "None") return [];
  const values = sourceText.split("; ");
  if (values.some((value) => !value)) fail(path, "Empty immunity entry");
  assertUnique(values, path, "condition immunity");
  return values;
}

function parseStability(sourceText, path) {
  const match = sourceText.match(/^(\d+)(?: \(([^)]+)\))?$/);
  if (!match) fail(path, `Unknown Stability format: ${sourceText}`);
  return {
    value: Number(match[1]),
    qualifier: match[2] ?? null,
    sourceText,
  };
}

function parseHealing(sourceText, path) {
  const base =
    "Summoned energy form: cannot be healed; disappears at 0 HP without leaving a body.";
  const potionSuffix = " Cannot swallow potions.";
  const harmedSuffix =
    " Healing-harmed: ordinary healing resolves as Life damage instead; no beneficial riders.";
  let potions = null;
  let healingHarmed = null;
  let remainder = sourceText;
  if (!remainder.startsWith(base))
    fail(path, `Unknown Healing restriction format: ${sourceText}`);
  remainder = remainder.slice(base.length);
  if (remainder === potionSuffix) {
    potions = false;
    remainder = "";
  } else if (remainder === harmedSuffix) {
    healingHarmed = {
      ordinaryHealing: "life-damage",
      beneficialRiders: false,
      sourceText: harmedSuffix.trim(),
    };
    remainder = "";
  }
  if (remainder) fail(path, `Unknown Healing restriction suffix: ${remainder}`);
  return {
    restoresHp: false,
    disappearsAtHp: 0,
    leavesBody: false,
    canSwallowPotions: potions,
    healingHarmed,
    sourceText,
  };
}

function parseCommand(sourceText, path) {
  if (!COMMAND_TEXTS.has(sourceText))
    fail(path, `Unknown summon command/controller/tether format: ${sourceText}`);
  const chains =
    sourceText.endsWith(" No summon chains.")
      ? {
          allowed: false,
          sourceText: "No summon chains.",
        }
      : {
          coverage: "not-stated-in-profile",
        };
  return {
    sourceText,
    mainCommand: {
      action: "main",
      includes: ["maneuver"],
    },
    maneuverCommand: {
      action: "maneuver",
      includes: ["movement"],
    },
    limits: {
      maxCommandsPerSummonPerControllerTurn: 1,
      immediateSummoningCommandCounts: true,
      activityWithoutCommand: false,
      alertsWithoutCommand: false,
      reactions: false,
      opportunityAttacks: false,
      turnTickAnchor: "controller",
    },
    tether: {
      maximumSquares: 6,
      whenBeyondMaximum: "disappears",
      sourceText,
    },
    controller: {
      whenUnconsciousOrDead: "disappears",
      sourceText,
    },
    disappearance: {
      atHp: 0,
      leavesBody: false,
    },
    loot: {
      permanent: false,
    },
    chains,
  };
}

function parseCarrying(sourceText, path) {
  const match = sourceText.match(
    /^(up to|At most) (\d+) Bulk; anatomy limits handling\. (No granted crafting training|No crafting training)\.$/,
  );
  if (!match) fail(path, `Unknown Carrying format: ${sourceText}`);
  return {
    maximumBulk: Number(match[2]),
    anatomyLimitsHandling: true,
    craftingTraining: false,
    sourceText,
  };
}

function splitRow(line, path) {
  if (!line.startsWith("| ") || !line.endsWith(" |"))
    fail(path, `Malformed attack-table row: ${line}`);
  const cells = line
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
  if (cells.length !== 6)
    fail(path, `Attack-table row has ${cells.length} cells, expected 6`);
  if (cells.some((cell) => !cell))
    fail(path, `Attack-table row has an empty cell: ${line}`);
  return cells;
}

function parseAttackTable(markdown, path) {
  const lines = markdown.split("\n");
  if (lines[0] !== ATTACK_HEADER)
    fail(path, `Unknown attack-table header: ${lines[0] ?? "<missing>"}`);
  if (lines[1] !== ATTACK_SEPARATOR)
    fail(path, "Malformed attack-table separator");
  if (lines.length < 3) fail(path, "Attack table has no rows");
  const mapped = lines.slice(2).map((line) => {
    const [name, attributeText, modifierText, weak, standard, strong] =
      splitRow(line, path);
    const attribute = ATTRIBUTE_NAMES.get(attributeText);
    if (!attribute) fail(path, `Unknown attack attribute: ${attributeText}`);
    return {
      name,
      attribute,
      attributeSourceText: attributeText,
      attackModifier: parseBoonBane(modifierText, path, "attack modifier"),
      outcomes: {
        weak,
        standard,
        strong,
      },
      orientation: "attacker",
      automation: "pending",
    };
  });
  assertUnique(
    mapped.map(({ name }) => name),
    path,
    "attack-table action",
  );
  return {
    header: ATTACK_HEADER,
    markdown,
    orientation: "attacker",
    actions: mapped,
  };
}

function parseDefend(block, path) {
  const match = block.match(/^\*\*Defend(?: — Maneuver)?:\*\* ([\s\S]+)$/);
  if (!match) fail(path, `Unknown Defend format: ${block}`);
  const text = match[1];
  const timing =
    text === DEFEND_TEXT["start-of-turn"]
      ? "start-of-next-controller-turn"
      : text === DEFEND_TEXT["controller-turn"]
        ? "until-controller-next-turn"
        : null;
  if (!timing) fail(path, `Unknown Defend text: ${text}`);
  return {
    kind: "ability-reference",
    id: "ability-defend",
    action: "maneuver",
    benefit: {
      boons: 1,
      appliesTo: "defenses",
    },
    duration: {
      turnAnchor: "controller",
      expiry: timing,
    },
    stacking: false,
    sourceText: text,
    markdown: block,
    automation: "pending",
  };
}

function parseBasicMelee(block, path) {
  const knownOutcomes = new Set(["1/1/2", "1/2/4", "2/3/5"]);
  const match = block.match(
    /^\*\*Basic Melee — Main:\*\* (?:(None|\d+ (?:Boon|Bane)s?) to attack; Brawn,|Brawn (None|\d+ (?:Boon|Bane)s?);) one adjacent target; Weak attack (\d+), Standard (\d+), Strong (\d+) physical damage\. No specialty riders\.(?: No opportunity Reaction\.)?$/,
  );
  if (!match) fail(path, `Unknown Basic Melee reference: ${block}`);
  const outcomeSignature = `${match[3]}/${match[4]}/${match[5]}`;
  if (!knownOutcomes.has(outcomeSignature))
    fail(path, `Unknown Basic Melee outcomes: ${outcomeSignature}`);
  const modifierText = match[1] ?? match[2];
  return {
    kind: "ability-reference",
    id: "ability-basic-melee",
    action: "main",
    attribute: "brawn",
    attackModifier: parseBoonBane(
      modifierText,
      path,
      "Basic Melee attack modifier",
    ),
    target: BASIC_MELEE_TARGET,
    outcomes: {
      weak: {
        damage: {
          amount: Number(match[3]),
          type: "physical",
        },
      },
      standard: {
        damage: {
          amount: Number(match[4]),
          type: "physical",
        },
      },
      strong: {
        damage: {
          amount: Number(match[5]),
          type: "physical",
        },
      },
    },
    orientation: "attacker",
    specialtyRiders: false,
    opportunityAttack: block.endsWith("No opportunity Reaction.")
      ? false
      : null,
    sourceText: block,
    automation: "pending",
  };
}

function labeledBlock(block, path) {
  const match = block.match(/^\*\*([^*\n]+):\*\* ([\s\S]+)$/);
  if (!match) fail(path, `Unknown bold summon entry: ${block}`);
  const [label, ...qualifierParts] = match[1].split(" — ");
  if (!label || !match[2])
    fail(path, `Empty summon entry label or text: ${block}`);
  return {
    label,
    qualifier: qualifierParts.length
      ? qualifierParts.join(" — ")
      : null,
    text: match[2],
    markdown: block,
  };
}

function namedEntry(name, category, text, markdown, style) {
  return {
    name,
    category,
    text,
    markdown,
    style,
    coverage: "prose-preserved; native automation pending",
    automation: "pending",
  };
}

function parseAttackDetail(block, action, path) {
  const parsed = labeledBlock(block, path);
  if (parsed.label !== action.name || parsed.qualifier)
    fail(path, `Multiple or qualified detail labels for ${action.name}`);
  return {
    name: action.name,
    targetAndRidersMarkdown: parsed.text,
    markdown: block,
    coverage: "prose-preserved; typed targeting and riders pending",
    automation: "pending",
  };
}

function parseOffensiveHealing(block, path) {
  const parsed = labeledBlock(block, path);
  if (
    parsed.label !== "Against offensive healing" ||
    parsed.qualifier
  )
    fail(path, `Unknown offensive-healing reference: ${block}`);
  const fortitude = /Fortitude/.test(parsed.text);
  if (!fortitude)
    fail(path, `Missing offensive-healing Fortitude reference: ${parsed.text}`);
  return {
    kind: "special-reference",
    reference: "offensive-healing-defense",
    attribute: "fortitude",
    sourceText: parsed.text,
    markdown: block,
    coverage: "prose-preserved; native automation pending",
    automation: "pending",
  };
}

function uniqueField(fields, label, path) {
  const entries = fields.get(label) ?? [];
  if (entries.length !== 1)
    fail(path, `Expected one ${label} field, found ${entries.length}`);
  return entries[0];
}

function sourceReference(kind, source, extra = {}) {
  return {
    kind,
    ...extra,
    path: source.path,
    sha256: source.sha256,
  };
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

export function parseSummon(record, text, context) {
  const path = record.path;
  if (!record.sha256) fail(path, "Missing source hash");
  if (!context?.commit) fail(path, "Missing source commit");
  const link = context.link;
  if (!link) fail(path, "Missing source-lock summon link");
  if (!link.id) fail(path, "Missing stable summon ID");
  if (link.path !== path)
    fail(path, `Summon link path differs: ${link.path}`);
  if (link.perspective !== "attacker")
    fail(path, `Unknown summon perspective: ${link.perspective}`);
  if (!/^[A-Za-z]+ [137]$/.test(link.eligibility))
    fail(path, `Unknown summon eligibility: ${link.eligibility}`);
  if (!context.creature?.id || !context.creature.path || !context.creature.sha256)
    fail(path, "Missing linked creature provenance");
  if (context.creature.id !== link.creatureId)
    fail(path, "Linked creature ID differs from source lock");
  if (
    !context.rules?.path ||
    !context.rules.sha256 ||
    context.rules.path !== SUMMON_RULES_PATH
  )
    fail(path, "Missing summon-rules provenance");

  const header = expectMatch(
    text,
    /^# ([^\n]+) \(CV (\d+)\)\n\n(\*[^*\n]+\*)\n\n/,
    path,
    "summon heading, CV, or flavor",
  );
  const name = header[1];
  const cv = Number(header[2]);
  const flavorMarkdown = header[3];
  const sourceBlocks = blocks(text);
  if (sourceBlocks[0] !== `# ${name} (CV ${cv})`)
    fail(path, "Title block does not match the parsed summon heading");
  if (sourceBlocks[1] !== flavorMarkdown)
    fail(path, "Flavor block does not match the parsed summon flavor");

  const fields = new Map();
  const attackDetails = [];
  const maneuvers = [];
  const passives = [];
  const specialActions = [];
  const notes = [];
  const offensiveHealing = [];
  let attackTable = null;
  let defend = null;
  let basicMelee = null;
  let commandSource = null;
  let summonedReferenceCount = 0;
  let section = null;
  const seenSections = new Set();
  let pendingHeading = null;

  for (let index = 2; index < sourceBlocks.length; index += 1) {
    const block = sourceBlocks[index];
    if (pendingHeading) {
      const boundary = block.startsWith("#") || block.startsWith("**") ||
        block.startsWith("[DA creature card]");
      if (!boundary) {
        pendingHeading.body.push(block);
        continue;
      }
      if (!pendingHeading.body.length)
        fail(path, `Missing body for ${pendingHeading.name}`);
      const body = pendingHeading.body.join("\n\n");
      const entry = namedEntry(
        pendingHeading.name,
        pendingHeading.category,
        body,
        `${pendingHeading.markdown}\n\n${body}`,
        "heading",
      );
      if (pendingHeading.category === "main-action") specialActions.push(entry);
      else maneuvers.push(entry);
      pendingHeading = null;
    }
    if (index === sourceBlocks.length - 1) {
      const footer = expectMatch(
        block,
        /^\[DA creature card\]\(\.\.\/creatures\/([a-z0-9-]+)\.md\) · \[Summon rules\]\(\.\.\/\.\.\/rules\/summoning\.md\)$/,
        path,
        "source footer links",
      );
      const creaturePath = `design/bestiary/creatures/${footer[1]}.md`;
      const summonPath = `design/bestiary/summons/${footer[1]}.md`;
      if (record.path !== summonPath)
        fail(path, `Profile path does not match creature link: ${creaturePath}`);
      if (context.creature.path !== creaturePath)
        fail(path, `Creature link differs from source lock: ${creaturePath}`);
      if (
        link.id !== `summon-${context.creature.id.slice("creature-".length)}`
      )
        fail(path, `Summon ID is not derived from linked creature: ${link.id}`);
      continue;
    }

    if (block === "## Attacks — Main Action") {
      if (attackTable) fail(path, "Duplicate attack-table section");
      const tableBlock = sourceBlocks[index + 1];
      if (!tableBlock?.startsWith("| Attack |"))
        fail(path, "Attacks section is not followed by the attack table");
      attackTable = parseAttackTable(tableBlock, path);
      index += 1;
      continue;
    }
    if (block === "## Maneuvers") {
      if (seenSections.has(block)) fail(path, `Duplicate ${block} section`);
      seenSections.add(block);
      section = "maneuvers";
      continue;
    }
    if (block === "## Passives") {
      if (seenSections.has(block)) fail(path, `Duplicate ${block} section`);
      seenSections.add(block);
      section = "passives";
      continue;
    }
    if (/^##(?!#)/.test(block))
      fail(path, `Unknown summon section: ${block}`);
    if (block.startsWith("###")) {
      const match = block.match(
        /^### ([^*\n]+?) — (Main Action|Maneuver)$/,
      );
      if (!match) fail(path, `Unknown specialty-action heading: ${block}`);
      pendingHeading = {
        name: match[1],
        category: match[2] === "Main Action" ? "main-action" : "maneuver",
        markdown: block,
        body: [],
      };
      continue;
    }

    if (block === SUMMONED_REFERENCE) {
      summonedReferenceCount += 1;
      continue;
    }
    if (block === ATTACK_INTRODUCTION) {
      notes.push({
        kind: "attack-reference",
        sourceText: block,
        automation: "pending",
      });
      continue;
    }
    if (block === ANCHOR_NOTE) {
      notes.push({
        kind: "anchor-reference",
        sourceText: block,
        automation: "pending",
      });
      continue;
    }
    if (block.startsWith("Main command:")) {
      if (commandSource) fail(path, "Duplicate Main command paragraph");
      commandSource = block;
      continue;
    }

    const field = block.match(/^\*\*([^*\n]+):\*\* ([\s\S]+)$/);
    if (
      field &&
      REQUIRED_FIELDS.includes(field[1])
    ) {
      const entries = fields.get(field[1]) ?? [];
      entries.push({
        label: field[1],
        text: field[2],
      });
      fields.set(field[1], entries);
      continue;
    }
    if (field?.[1] === "Against offensive healing") {
      offensiveHealing.push(parseOffensiveHealing(block, path));
      continue;
    }

    if (block.startsWith("**Defend")) {
      if (defend) fail(path, "Duplicate Defend reference");
      defend = parseDefend(block, path);
      section = null;
      continue;
    }
    if (block.startsWith("**Basic Melee — Main:**")) {
      if (basicMelee) fail(path, "Duplicate Basic Melee reference");
      basicMelee = parseBasicMelee(block, path);
      section = null;
      continue;
    }

    if (block.startsWith("**")) {
      const parsed = labeledBlock(block, path);
      const attack = attackTable?.actions.find(
        ({ name: actionName }) => actionName === parsed.label,
      );
      if (attack && !parsed.qualifier) {
        attackDetails.push(parseAttackDetail(block, attack, path));
        continue;
      }
      if (parsed.qualifier === "Passive") {
        passives.push(
          namedEntry(
            parsed.label,
            "passive",
            parsed.text,
            block,
            "inline-field",
          ),
        );
        continue;
      }
      if (parsed.qualifier === "Maneuver") {
        maneuvers.push(
          namedEntry(
            parsed.label,
            "maneuver",
            parsed.text,
            block,
            "inline-field",
          ),
        );
        continue;
      }
      if (parsed.qualifier === "Main Action") {
        specialActions.push(
          namedEntry(
            parsed.label,
            "main-action",
            parsed.text,
            block,
            "inline-field",
          ),
        );
        continue;
      }
      if (parsed.qualifier)
        fail(path, `Unknown qualified summon entry: ${block}`);
      if (section === "maneuvers") {
        maneuvers.push(
          namedEntry(
            parsed.label,
            "maneuver",
            parsed.text,
            block,
            "section-field",
          ),
        );
        continue;
      }
      if (section === "passives") {
        passives.push(
          namedEntry(
            parsed.label,
            "passive",
            parsed.text,
            block,
            "section-field",
          ),
        );
        continue;
      }
    }

    fail(path, `Unrecognized summon structure: ${block}`);
  }

  if (pendingHeading) fail(path, `Missing body for ${pendingHeading.name}`);
  if (summonedReferenceCount !== 1)
    fail(
      path,
      `Expected one summoned-reference marker, found ${summonedReferenceCount}`,
    );
  if (!attackTable) fail(path, "Missing attack table");
  if (!defend) fail(path, "Missing Defend reference");
  if (!basicMelee) fail(path, "Missing Basic Melee reference");
  if (!commandSource) fail(path, "Missing command/controller/tether paragraph");
  if (offensiveHealing.length > 1)
    fail(path, "Duplicate offensive-healing reference");

  for (const action of attackTable.actions) {
    const details = attackDetails.filter(({ name: detailName }) => {
      return detailName === action.name;
    });
    if (details.length !== 1)
      fail(
        path,
        `Expected one authored detail for ${action.name}, found ${details.length}`,
      );
  }
  const actionNames = new Set(attackTable.actions.map(({ name: value }) => value));
  const extraDetails = attackDetails.filter(
    ({ name: detailName }) => !actionNames.has(detailName),
  );
  if (extraDetails.length)
    fail(path, `Detail has no attack row: ${extraDetails[0].name}`);

  const attributes = uniqueField(fields, "Attributes", path);
  const hp = uniqueField(fields, "HP", path);
  const defenseModifier = uniqueField(fields, "Defense modifier", path);
  const damageMitigation = uniqueField(fields, "DR / resistance", path);
  const weakness = uniqueField(fields, "Weakness", path);
  const healing = uniqueField(fields, "Healing", path);
  const senses = uniqueField(fields, "Senses", path);
  const communication = uniqueField(fields, "Communication", path);
  const eligibility = uniqueField(fields, "Eligibility", path);
  const carrying = uniqueField(fields, "Carrying", path);

  const hpMatch = expectMatch(
    hp.text,
    /^(\d+) · \*\*Speed:\*\* ([^·\n]+) · \*\*Footprint:\*\* (\d+x\d+)$/,
    path,
    "HP, Speed, or Footprint line",
  );
  const defenseMatch = expectMatch(
    defenseModifier.text,
    /^(.+?)\. · \*\*Stability:\*\* (.+?)\.$/,
    path,
    "Defense modifier or Stability line",
  );
  const mitigationMatch = expectMatch(
    damageMitigation.text,
    /^(.+?) · \*\*Condition immunities:\*\* (.+)$/,
    path,
    "DR / resistance or condition-immunities line",
  );
  if (eligibility.text !== link.eligibility)
    fail(
      path,
      `Eligibility ${eligibility.text} differs from source lock ${link.eligibility}`,
    );

  return {
    id: link.id,
    foundryId: foundryIdFor(link.id),
    kind: "summon-profile-reference",
    name,
    cv,
    creatureId: context.creature.id,
    eligibility: eligibility.text,
    eligibilitySourceText: eligibility.text,
    actionOrientation: "attacker",
    source: {
      repository: context.repository ?? null,
      commit: context.commit,
      path: record.path,
      sha256: record.sha256,
    },
    references: {
      creature: sourceReference("creature-reference", context.creature, {
        id: context.creature.id,
      }),
      summonRules: sourceReference("rules-reference", context.rules, {
        id: "summoning-rules",
      }),
      summoning: {
        kind: "summon-profile",
        id: link.id,
      },
    },
    attributes: parseAttributes(attributes.text, path),
    attributesSourceText: attributes.text,
    hp: {
      maximum: Number(hpMatch[1]),
      sourceText: hpMatch[1],
    },
    speed: parseSpeed(hpMatch[2].trim(), path),
    footprint: parseFootprint(hpMatch[3].trim(), path),
    defenseModifier: parseBoonBane(
      defenseMatch[1].trim(),
      path,
      "Defense modifier",
    ),
    stability: parseStability(defenseMatch[2].trim(), path),
    mitigation: {
      resistances: parseResistances(mitigationMatch[1].trim(), path),
      conditionImmunities: parseImmunities(
        mitigationMatch[2].trim(),
        path,
      ),
      weakness: parseWeakness(weakness.text, path),
    },
    healing: parseHealing(healing.text, path),
    command: parseCommand(commandSource, path),
    carrying: parseCarrying(carrying.text, path),
    senses: senses.text,
    communication: communication.text,
    referencesById: {
      basicMelee: basicMelee.id,
      defend: defend.id,
    },
    basicMelee,
    defend,
    attacks: attackTable,
    reference: {
      sourceMarkdown: text,
      flavorMarkdown,
      attackDetails,
      maneuvers,
      passives,
      specialActions,
      notes,
      offensiveHealing,
    },
    coverage: {
      sourceIntake: "complete",
      stats: "structured",
      ordinaryAndSpecialMitigation: "typed; special prose preserved",
      attackTable: "complete; attacker orientation preserved",
      targetAndRiders: "prose-preserved; typed adapters pending",
      commandControllerTetherHealing: "structured; native automation pending",
      nativeAutomation: "pending",
    },
    documentMapping: {
      actor: false,
      note: "Reference profile only; native summon Actor/spawn lifecycle is a later issue.",
    },
  };
}

export function summarizeSummonCatalog(records) {
  assertUnique(records.map(({ id }) => id), "summon catalog", "record ID");
  assertUnique(
    records.map(({ foundryId }) => foundryId),
    "summon catalog",
    "Foundry ID",
  );
  assertUnique(
    records.map(({ source: { path } }) => path),
    "summon catalog",
    "source path",
  );
  assertUnique(
    records.map(({ creatureId }) => creatureId),
    "summon catalog",
    "creature ID",
  );
  for (const record of records) {
    if (record.kind !== "summon-profile-reference")
      fail(record.source.path, `Unknown summon record kind: ${record.kind}`);
    if (record.actionOrientation !== "attacker")
      fail(record.source.path, "Summon attack orientation is not attacker");
    if (record.documentMapping.actor !== false)
      fail(record.source.path, "Reference profile must not claim a native Actor");
  }
  return {
    profiles: records.length,
    linkedCreatures: new Set(records.map(({ creatureId }) => creatureId)).size,
    attackRows: records.reduce(
      (sum, record) => sum + record.attacks.actions.length,
      0,
    ),
    attackDetails: records.reduce(
      (sum, record) => sum + record.reference.attackDetails.length,
      0,
    ),
    maneuvers: records.reduce(
      (sum, record) => sum + record.reference.maneuvers.length,
      0,
    ),
    passives: records.reduce(
      (sum, record) => sum + record.reference.passives.length,
      0,
    ),
    specialActions: records.reduce(
      (sum, record) => sum + record.reference.specialActions.length,
      0,
    ),
    offensiveHealingReferences: records.reduce(
      (sum, record) => sum + record.reference.offensiveHealing.length,
      0,
    ),
  };
}
