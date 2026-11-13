import assert from "node:assert/strict";
import { parseAbilityReference } from "./choices.mjs";

const costs = [1, 2, 2, 3];
const levels = [0, 0, 0, 3];
const sections = ["I", "II", "III", "IV"];
const pages = ["1", "2", "3", "4", "5", "6", "7", "8", "A1", "A2", "A3"];
const pageSections = [0, 0, 1, 1, 2, 2, 3, 3, 3, 3, 3];
const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const title = (text) => match(text, /^# (.+)$/m, "title")[1];
const coins = (text) =>
  Number(
    match(
      text,
      /^\*\*Starting coin contribution:\*\* \+(\d+) coins/m,
      "starting coin",
    )[1],
  );

function match(text, pattern, label) {
  const result = text.match(pattern);
  assert.ok(result, `Missing or invalid ${label}`);
  return result;
}

function index(items, key, label) {
  const result = new Map(items.map((item) => [key(item), item]));
  assert.equal(result.size, items.length, `Duplicate ${label}`);
  return result;
}

function readSteps(text, disciplineId, path, training) {
  const steps = [];
  for (const [, name, dp, level, effect] of text.matchAll(
    /^### (.+)\nDP: (\d+) \| Level: (\d+)\n([\s\S]+?)(?=^### |(?![\s\S]))/gm,
  )) {
    steps.push({
      name,
      dp: Number(dp),
      level: Number(level),
      effect: effect.trim(),
    });
  }
  assert.equal(steps.length, 4, path.id);
  assert.deepEqual(
    steps.map(({ dp }) => dp),
    costs,
    path.id,
  );
  assert.deepEqual(
    steps.map(({ level }) => level),
    levels,
    path.id,
  );
  return steps.map((step, i) => {
    const first = `${path.id}:1`;
    const node = {
      id: `${path.id}:${i + 1}`,
      ...step,
      kind: training
        ? "training"
        : i === 1 || i === 2
          ? "improvement"
          : "technique",
      disciplineId,
      pathId: path.id,
      requires: [i ? `${path.id}:${i}` : disciplineId],
    };
    if (node.kind === "improvement") node.improves = first;
    if (training) {
      const capacity = step.effect.match(/^Maximum SP \+(\d+)\./);
      if (capacity) node.spCapacity = Number(capacity[1]);
      else
        node.spRecovery = Number(
          match(step.effect, /recover (\d+) SP|restores (\d+) SP/, step.name)
            .slice(1)
            .find(Boolean),
        );
    }
    return node;
  });
}

function readSpellbook(text, bookId, discipline, endpoint, pathId) {
  const [, name, disciplineName, listName, sourceId, endpointName] = match(
    text,
    /^# (.+)\nDiscipline: (.+)\nList: (.+)\nID: ([\w-]+)\nEndpoint: (.+)\n/,
    `spellbook ${bookId} header`,
  );
  assert.equal(sourceId, bookId);
  assert.deepEqual(
    [disciplineName, listName, endpointName],
    [discipline.name, endpoint.list, endpoint.name],
  );
  const [table, profiles] = text.split("\n## Spells\n");
  assert.ok(profiles, `Missing spell profiles in ${bookId}`);
  const rows = [
    ...table.matchAll(/^\| (\d+|A\d+) \| (.+) \| (\d+) \| (I|II|III|IV) \|$/gm),
  ];
  assert.deepEqual(
    rows.map((row) => row[1]),
    pages,
    bookId,
  );
  const spells = profiles
    .split(/^### /m)
    .slice(1)
    .map((entry, i) => {
      const [
        ,
        spellName,
        id,
        page,
        actionText,
        sp,
        attribute,
        target,
        duration,
        effect,
      ] = match(
        entry.trim(),
        /^(.+)\n\n\*\*ID:\*\* (.+)\n\*\*Page:\*\* (.+)\n\*\*Action:\*\* (.+)\n\*\*SP:\*\* (\d+)\n\*\*Attribute:\*\* (.+)\n\*\*Target \/ range:\*\* (.+)\n\*\*Duration:\*\* (.+)\n\n([\s\S]+)$/,
        `spell profile in ${bookId}`,
      );
      const section = sections[pageSections[i]];
      assert.deepEqual([page, spellName, sp, section], rows[i]?.slice(1), id);
      assert.equal(id, `spell:${bookId}:${page.toLowerCase()}`);
      const [action, detail] = actionText.split(" · ");
      const timing =
        action === "Reaction"
          ? { trigger: detail }
          : action === "Ritual"
            ? { ritualTime: detail }
            : {};
      assert.ok(
        ["Reaction", "Ritual", "Main Action", "Maneuver"].includes(action),
        action,
      );
      assert.equal(
        Boolean(detail),
        action === "Reaction" || action === "Ritual",
        id,
      );
      return {
        id,
        name: spellName,
        bookId,
        page,
        section,
        sp: Number(sp),
        action,
        actionText,
        ...timing,
        attribute,
        target,
        duration,
        effect,
      };
    });
  assert.equal(spells.length, pages.length, bookId);
  assert.equal(spells[0].sp, 0, bookId);
  assert.deepEqual(
    spells.slice(6).map((spell) => spell.name),
    endpoint.spells,
    endpoint.id,
  );
  const nodes = sections.map((section, i) => ({
    id: `${bookId}:${i}`,
    name: i === 3 ? endpointName : `${listName} ${section}`,
    kind: "section",
    disciplineId: discipline.id,
    pathId,
    bookId,
    section,
    dp: costs[i],
    level: levels[i],
    requires: [i ? `${bookId}:${i - 1}` : discipline.id],
    spellIds: spells
      .filter((spell) => spell.section === section)
      .map((spell) => spell.id),
  }));
  const theme = table.split("\n\n")[1]?.trim();
  return {
    book: {
      id: bookId,
      name,
      listName,
      disciplineId: discipline.id,
      pathId,
      theme,
      spellIds: spells.map((spell) => spell.id),
    },
    spells,
    nodes,
  };
}

function readCard(text) {
  const reference = parseAbilityReference(text, { inlineRollOutcomes: false });
  const [, authoredId] = match(text, /^\*\*ID:\*\* ([\w-]+)$/m, "ability ID");
  const [, level, dp] = match(
    text,
    /^\*\*Tier \/ minimum level:\*\* (Universal|\d+) · \*\*DP:\*\* (Not purchased|Class choice|\d+) ·/m,
    authoredId,
  );
  const detail = (label) =>
    reference.rules.details.find((entry) => entry.label === label)?.value;
  return {
    id: `ability-${authoredId}`,
    name: title(text),
    level: level === "Universal" ? 0 : Number(level),
    dp: /^\d+$/.test(dp) ? Number(dp) : null,
    action: detail("Action"),
    attribute: detail("Attribute"),
    target: detail("Target / range / shape"),
    duration: detail("Duration"),
    equipment: detail("Equipment / acquisition"),
    limits: detail("Limits"),
    effect: text.split("\n## Rules\n")[1].split("\n---\n")[0].trim(),
    reference,
    referenceMarkdown: text,
  };
}

export function parseForge(read, list, sourceCommit) {
  const disciplines = [],
    nodes = [],
    spells = [],
    books = [];
  const development = read("design/development.md");
  const [, ancestrySp, classSp] = match(
    development,
    /^Ancestry, culture and background each contribute (\d+) maximum SP at level 0\. Class adds (\d+) at level 1,/m,
    "starting SP",
  );
  const endpointEntries = [
    ...read("design/magic-endpoints.md").matchAll(
      /^## (.+)\nID: ([\w-]+:3)\nDiscipline: (.+)\nList: (.+)\nPages 7–8: (.+)\nAdvanced pages: (.+)$/gm,
    ),
  ].map(([, name, id, discipline, list, final, advanced]) => ({
    name,
    id,
    discipline,
    list,
    spells: `${final}; ${advanced}`.split("; "),
  }));
  const endpoints = index(
    endpointEntries,
    (endpoint) => endpoint.id,
    "magical endpoint",
  );
  for (const [, name, id] of read("design/disciplines.md").matchAll(
    /^- \[(.+)\]\(disciplines\/([\w-]+)\.md\)$/gm,
  )) {
    const text = read(`design/disciplines/${id}.md`);
    assert.equal(title(text), name);
    const discipline = { id, name, paths: [] };
    const theme = text
      .slice(text.indexOf("\n") + 1)
      .trim()
      .split("\n\n")[0]
      .trim();
    disciplines.push({ ...discipline, theme });
    nodes.push({
      id,
      name,
      kind: "discipline",
      dp: 1,
      level: 0,
      requires: [],
      effect: theme,
    });
    for (const [, pathName, body] of text.matchAll(
      /^## (.+)\n([\s\S]*?)(?=^## |(?![\s\S]))/gm,
    )) {
      if (id === "spellcraft" && pathName === "Channeling") continue;
      const path = { id: `${id}:${slug(pathName)}`, name: pathName };
      const entries = readSteps(body, id, path, id === "spellcraft");
      discipline.paths.push({
        ...path,
        steps: entries.map((entry) => entry.id),
      });
      nodes.push(...entries);
    }
    const linkedBooks = [
      ...text.matchAll(
        /^- \[([^\]]+)\]\(\.\.\/spellbooks\/([\w-]+)\.md\)\.$/gm,
      ),
    ];
    if (id === "spellcraft") linkedBooks.push([null, null, "channeling"]);
    for (const [, bookTitle, bookId] of linkedBooks) {
      const endpoint = endpoints.get(`${bookId}:3`);
      assert.ok(endpoint, `Missing endpoint for ${bookId}`);
      assert.equal(endpoint.discipline, name);
      const pathId = `${id}:${bookId}`;
      const parsed = readSpellbook(
        read(`design/spellbooks/${bookId}.md`),
        bookId,
        discipline,
        endpoint,
        pathId,
      );
      if (bookTitle) assert.equal(parsed.book.name, bookTitle);
      books.push(parsed.book);
      spells.push(...parsed.spells);
      nodes.push(...parsed.nodes);
      discipline.paths.push({
        id: pathId,
        name: endpoint.list,
        bookId,
        steps: parsed.nodes.map((node) => node.id),
      });
    }
    assert.equal(discipline.paths.length, 4, name);
  }

  const disciplineByName = index(
    disciplines,
    (discipline) => discipline.name,
    "discipline",
  );
  const nodeById = index(nodes, (node) => node.id, "learning node");
  const pathById = index(
    disciplines.flatMap((discipline) => discipline.paths),
    (path) => path.id,
    "path",
  );
  const endpointIds = new Set(
    [...pathById.values()].map((path) => path.steps.at(-1)),
  );
  assert.equal(endpointEntries.length, books.length);
  index(books, (book) => book.id, "spellbook");
  index(spells, (spell) => spell.id, "spell");

  for (const part of read("design/combined-abilities.md")
    .split(/^## /m)
    .slice(1)) {
    const [, name, dp, level, references, effect] = match(
      part.trim(),
      /^(.+)\nDP: (\d+) \| Level: (\d+)\nRequires: (.+)\n([\s\S]+)$/,
      "combined ability",
    );
    const requires = references.split(", ");
    const parents = requires.map((id) => {
      assert.ok(
        endpointIds.has(id),
        `${name} requires an unknown or incomplete endpoint ${id}`,
      );
      return nodeById.get(id);
    });
    assert.ok(requires.length >= 2 && requires.length <= 4, name);
    assert.equal(
      new Set(parents.map((parent) => parent.disciplineId)).size,
      requires.length,
      name,
    );
    assert.equal(Number(dp), requires.length + 1, name);
    assert.equal(Number(level), 7, name);
    nodes.push({
      id: `combined:${slug(name)}`,
      name,
      kind: "combined",
      dp: Number(dp),
      level: Number(level),
      requires,
      effect,
    });
  }

  const firstSteps = index(
    disciplines.flatMap(({ paths }) =>
      paths.map(({ steps, bookId }) => {
        const node = nodeById.get(steps[0]);
        const path = bookId
          ? `spellbooks/${bookId}.md`
          : `disciplines/${node.disciplineId}.md`;
        return { node, key: `${path}:${node.name}` };
      }),
    ),
    (entry) => entry.key,
    "first-step reference",
  );
  const findFirst = (path, name) => {
    const entry = firstSteps.get(`${path}:${name}`);
    assert.ok(entry, `Unknown first step ${name} in ${path}`);
    return entry.node;
  };
  const redirects = Object.fromEntries(
    Object.entries(
      JSON.parse(read("design/migration/learning-redirects.json")),
    ).map(([id, entry]) => [
      `ability-${id}`,
      findFirst(entry.target, entry.learning).id,
    ]),
  );

  const origins = list("design/origins").map((file) => {
    const text = read(file);
    const id = file.split("/").at(-1).replace(/\.md$/, "");
    const kind = id.split("-")[0];
    const pairs = [
      ...text.matchAll(
        /^- \*\*(.+) access\*\* and \[([^\]]+)\]\(\.\.\/([^\)]+)\)\.$/gm,
      ),
    ].map(([, disciplineName, entryName, path]) => {
      const entry = findFirst(path, entryName);
      assert.equal(
        disciplineByName.get(disciplineName)?.id,
        entry.disciplineId,
        file,
      );
      return { disciplineId: entry.disciplineId, entryId: entry.id };
    });
    assert.equal(pairs.length, 2, file);
    assert.ok(["culture", "background"].includes(kind), file);
    return {
      id: `origin-${id}`,
      name: title(text),
      kind,
      pairs,
      coinContribution: coins(text),
      spContribution: Number(ancestrySp),
      referenceMarkdown: text,
    };
  });

  const originRedirects = Object.fromEntries(
    Object.entries(JSON.parse(read("design/migration/origin-grants.json"))).map(
      ([key, entry]) => {
        const node = findFirst(entry.source, entry.ability);
        const originId = `origin-${key.split(":")[0].replace(/\.md$/, "")}`;
        const origin = origins.find((record) => record.id === originId);
        assert.ok(
          origin?.pairs.some((pair) => pair.entryId === node.id),
          key,
        );
        assert.equal(
          node.disciplineId,
          disciplineByName.get(entry.discipline)?.id,
          key,
        );
        return [
          key,
          { originId, entryId: node.id, disciplineId: node.disciplineId },
        ];
      },
    ),
  );

  const signatures = [];
  const classes = list("design/classes").map((file) => {
    const text = read(file);
    const id = `class-${file.split("/").at(-1).replace(/\.md$/, "")}`;
    const name = title(text);
    const [, hp] = match(
      text,
      /HP contribution \+(\d+) at level 1 and per level thereafter/,
      `HP for ${id}`,
    );
    const [, sp] = match(
      text,
      /^\*\*Starting SP contribution:\*\* \+(\d+) maximum SP once, at level 1\.$/m,
      `SP for ${id}`,
    );
    assert.equal(sp, classSp, id);
    const [, choices] = match(
      text,
      /^\*\*Starting disciplines:\*\* choose two distinct disciplines from (.+)\.$/m,
      `disciplines for ${id}`,
    );
    const disciplineIds = choices.split(", ").map((choice) => {
      const discipline = disciplineByName.get(choice);
      assert.ok(discipline, choice);
      return discipline.id;
    });
    const minimumAttributes = text.includes("no attribute minimums")
      ? []
      : match(
          text,
          /minimum 0 in (\w+)(?:, | and )(\w+); HP contribution/,
          `attributes for ${id}`,
        )
          .slice(1)
          .map((attribute) => attribute.toLowerCase());
    const signatureChoices = Object.fromEntries(
      [...text.matchAll(/^## Level (\d+) choices\n\n((?:- .+\n)+)/gm)].map(
        ([, level, choices]) => {
          const ids = [
            ...choices.matchAll(
              /^- \[([^\]]+)\]\(\.\.\/cards\/([\w-]+)\.md\)$/gm,
            ),
          ].map(([, label, filename]) => {
            const card = readCard(read(`design/cards/${filename}.md`));
            assert.deepEqual(
              [card.name, card.level, card.dp],
              [label, Number(level), null],
              filename,
            );
            signatures.push({ ...card, classId: id });
            return card.id;
          });
          assert.equal(ids.length, 3, `${id} level ${level} signatures`);
          return [level, ids];
        },
      ),
    );
    assert.deepEqual(Object.keys(signatureChoices), ["1", "3", "7"], id);
    return {
      id,
      name,
      disciplineIds,
      signatures: signatureChoices,
      minimumAttributes,
      hpContribution: Number(hp),
      spContribution: Number(sp),
      coinContribution: coins(text),
      referenceMarkdown: text,
    };
  });

  const ancestryAliases = { "wood-elf": "elf", "hill-dwarf": "dwarf" };
  const ancestries = list("design/ancestries")
    .filter((file) => !file.includes("/trait-"))
    .map((file) => {
      const text = read(file);
      const filename = file.split("/").at(-1).replace(/\.md$/, "");
      const [, hp, speed] = match(
        text,
        /^\*\*Starting values:\*\* HP contribution \+(\d+) at creation and per level; base Speed (\d+)/m,
        file,
      );
      return {
        id: `ancestry-${ancestryAliases[filename] ?? filename}`,
        name: title(text),
        hpContribution: Number(hp),
        spContribution: Number(ancestrySp),
        baseSpeed: Number(speed),
        coinContribution: coins(text),
      };
    });

  const signatureIds = index(signatures, (card) => card.id, "signature");
  const basicActions = [];
  for (const [, label, filename] of read("design/catalog.md").matchAll(
    /^- \[([^\]]+)\]\(cards\/([\w-]+)\.md\)$/gm,
  )) {
    if (signatureIds.has(`ability-${filename}`)) continue;
    const card = readCard(read(`design/cards/${filename}.md`));
    assert.equal(card.name, label, filename);
    assert.equal(card.level, 0, filename);
    if (card.dp === null) basicActions.push(card);
    else {
      assert.equal(card.dp, 1, filename);
      nodes.push({ ...card, kind: "talent", requires: [] });
    }
  }

  index(nodes, (node) => node.id, "node");
  assert.deepEqual(
    [
      disciplines.length,
      books.length,
      spells.length,
      nodes.filter((node) => node.kind === "combined").length,
      classes.length,
      signatures.length,
      origins.length,
      ancestries.length,
      basicActions.length,
      nodes.filter((node) => node.kind === "talent").length,
    ],
    [19, 29, 319, 41, 10, 90, 50, 10, 18, 6],
    "Forge catalog coverage",
  );
  return {
    schemaVersion: 1,
    sourceCommit,
    disciplines,
    nodes,
    books,
    spells,
    origins,
    classes,
    signatures,
    ancestries,
    basicActions,
    redirects,
    originRedirects,
  };
}
