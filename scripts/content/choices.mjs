import { createHash } from "node:crypto";
const affinities = {
  home: [1, 2, 4],
  adjacent: [2, 4, 8],
  foreign: [3, 6, 12],
  opposed: [4, 8, 16],
};
const attributes = [
  "brawn",
  "fortitude",
  "agility",
  "guile",
  "knowledge",
  "reason",
];
const slug = (value) => value.toLowerCase().replaceAll(" ", "-");
function match(text, regex, label) {
  const m = text.match(regex);
  if (!m) throw new Error(`Unrecognized ${label}`);
  return m;
}
function links(text) {
  return [...text.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g)].map((m) => m[1]);
}
export function parseChoices(sources) {
  const records = [];
  const byPath = new Map();
  for (const source of sources) {
    const { path, text, sha256 } = source;
    const filename = path.split("/").at(-1).replace(/\.md$/, "");
    let kind;
    if (path.startsWith("design/cards/")) kind = "ability";
    else if (path.startsWith("design/classes/")) kind = "class";
    else if (path.startsWith("design/origins/")) kind = "origin";
    else if (path.startsWith("design/disciplines/")) kind = "discipline";
    else if (path.startsWith("design/ancestries/"))
      kind = filename.startsWith("trait-") ? "trait" : "ancestry";
    else continue;
    const authoredId =
      kind === "ability"
        ? match(text, /\*\*ID:\*\* ([\w-]+)/, `${path} ID`)[1]
        : filename;
    const id = kind === "trait" ? authoredId : `${kind}-${authoredId}`;
    const record = {
      id,
      foundryId: createHash("sha256")
        .update(`heroes-of-legend:${id}`)
        .digest("hex")
        .slice(0, 16),
      kind,
      name: match(text, /^# ([^\n]+)/, `${path} title`)[1],
      source: { path, sha256 },
      automation: "pending",
    };
    records.push(record);
    byPath.set(path, { record, text });
  }
  const disciplines = new Map(
    records.filter((r) => r.kind === "discipline").map((r) => [r.name, r.id]),
  );
  const discipline = (name) => {
    if (!disciplines.has(name)) throw new Error(`Unknown discipline ${name}`);
    return disciplines.get(name);
  };
  const classes = new Map(
    records.filter((r) => r.kind === "class").map((r) => [r.name, r.id]),
  );
  const coins = (text) =>
    Number(
      match(
        text,
        /\*\*Starting coin contribution:\*\* ([+-]?\d+) coins/,
        "coin contribution",
      )[1],
    );
  const resolve = (source, relative) => {
    const parts = source.split("/").slice(0, -1);
    for (const part of relative.split("/")) {
      if (part === "..") parts.pop();
      else if (part !== ".") parts.push(part);
    }
    const target = byPath.get(parts.join("/"))?.record;
    if (!target) throw new Error(`Missing choice link ${source}: ${relative}`);
    return target.id;
  };
  for (const { record: r, text } of byPath.values()) {
    const path = r.source.path;
    if (r.kind === "ability") {
      const meta = match(
        text,
        /\*\*Tier \/ minimum level:\*\* (Universal|[137]) · \*\*DP:\*\* (Not purchased|\d+) · \*\*Requirements to learn:\*\* ([^\n]+)/,
        `${path} learning metadata`,
      );
      r.universal = meta[1] === "Universal";
      r.minimumLevel = r.universal ? 0 : Number(meta[1]);
      r.cost = r.universal ? null : Number(meta[2]);
      if (
        r.universal
          ? meta[2] !== "Not purchased"
          : r.cost !== { 1: 2, 3: 4, 7: 8 }[r.minimumLevel]
      )
        throw new Error(`Unexpected tier cost ${path}`);
      const limits = match(
        text,
        /\*\*Limits:\*\* ([^\n]+)/,
        `${path} limits`,
      )[1];
      r.purchasePolicy = r.universal ? "never" : "once";
      if (
        limits ===
        "At most one purchase per level; unused purchases cannot be saved."
      )
        r.purchasePolicy = "per-level";
      else if (limits === "Repeatable purchase of new recipe choices.")
        r.purchasePolicy = "new-recipe";
      else if (/purchase/i.test(limits) && limits !== "Purchase once.")
        throw new Error(`Unknown purchase policy ${path}`);
      const requirements = meta[3];
      r.requirements = [];
      if (requirements.startsWith("Class ")) {
        const m = match(
          requirements,
          /^Class ([\w ]+); minimum level ([137])$/,
          `${path} class requirement`,
        );
        if (!classes.has(m[1]) || Number(m[2]) !== r.minimumLevel)
          throw new Error(`Invalid signature ${path}`);
        r.classId = classes.get(m[1]);
      } else if (requirements !== "None") {
        let rankText = requirements;
        if (rankText.endsWith("; known compatible crafting card")) {
          r.requirements.push({
            kind: "capability",
            capability: "compatible-crafting",
          });
          rankText = rankText.replace("; known compatible crafting card", "");
        }
        for (const part of rankText.split(" and ")) {
          const m = match(
            part,
            /^([\w ]+) ([123])$/,
            `${path} rank requirement`,
          );
          r.requirements.push({
            kind: "discipline",
            id: discipline(m[1]),
            rank: Number(m[2]),
          });
        }
      }
    } else if (r.kind === "class") {
      r.hp = Number(match(text, /HP contribution \+(\d+)/, `${path} HP`)[1]);
      r.coins = coins(text);
      r.minimumAttributes = text.includes("no attribute minimums")
        ? []
        : match(text, /minimum 0 in ([^;]+);/, `${path} minimums`)[1]
            .split(/, | and /)
            .map(slug);
      if (r.minimumAttributes.some((a) => !attributes.includes(a)))
        throw new Error(`Unknown class attribute ${path}`);
      r.startingDisciplines = match(
        text,
        /choose two distinct rank-1 disciplines from ([^.]+)\./,
        `${path} starting disciplines`,
      )[1]
        .split(", ")
        .map(discipline);
      r.prices = {};
      if (text.includes("Adjacent for every discipline."))
        for (const id of disciplines.values())
          r.prices[id] = affinities.adjacent;
      else {
        const home = match(text, /Home: ([^.]+)\./, `${path} Home prices`)[1]
          .split(", ")
          .map(discipline);
        const adjacent = match(
          text,
          /Adjacent: ([^.]+)\./,
          `${path} Adjacent prices`,
        )[1]
          .split(", ")
          .map(discipline);
        if (!text.includes("All others Foreign; no Opposed"))
          throw new Error(`Unknown affinity policy ${path}`);
        for (const id of disciplines.values())
          r.prices[id] =
            affinities[
              home.includes(id)
                ? "home"
                : adjacent.includes(id)
                  ? "adjacent"
                  : "foreign"
            ];
      }
      r.signatures = {};
      for (const level of [1, 3, 7]) {
        const section = match(
          text,
          new RegExp(`## Level ${level} choices\\n([\\s\\S]*?)(?=\\n## |$)`),
          `${path} signatures ${level}`,
        )[1];
        r.signatures[level] = links(section)
          .filter((l) => l.includes("/cards/"))
          .map((l) => resolve(path, l));
        if (r.signatures[level].length !== 3)
          throw new Error(`Expected three signature options ${path}:${level}`);
      }
    } else if (r.kind === "origin") {
      r.originType = match(
        text,
        /\*\*Type:\*\* (Culture|Background)/,
        `${path} origin type`,
      )[1].toLowerCase();
      r.coins = coins(text);
      r.pairs = [
        ...text.matchAll(
          /^- (?:\*\*)?([\w ]+) 1(?:\*\*)? and \[[^\]]+\]\(([^)]+)\)/gm,
        ),
      ].map((m) => ({
        disciplineId: discipline(m[1]),
        rank: 1,
        abilityId: resolve(path, m[2]),
      }));
      if (r.pairs.length !== 2)
        throw new Error(`Expected two complete origin pairs ${path}`);
    } else if (r.kind === "ancestry") {
      const values = match(
        text,
        /HP \+(\d+); base Speed (\d+)/,
        `${path} starting values`,
      );
      r.hp = Number(values[1]);
      r.speed = Number(values[2]);
      r.coins = coins(text);
      r.traits = links(text)
        .filter((l) => l.startsWith("trait-"))
        .map((l) => resolve(path, l));
      if (r.traits.length !== 5)
        throw new Error(`Expected five ancestry traits ${path}`);
    } else if (r.kind === "trait") {
      const name = match(
        text,
        /\*\*Ancestry:\*\* ([^·]+) ·/,
        `${path} ancestry`,
      )[1].trim();
      r.ancestryId = records.find(
        (a) => a.kind === "ancestry" && a.name === name,
      )?.id;
      if (!r.ancestryId) throw new Error(`Unknown trait ancestry ${path}`);
    }
  }
  if (
    new Set(records.map((r) => r.id)).size !== records.length ||
    new Set(records.map((r) => r.foundryId)).size !== records.length
  )
    throw new Error("Duplicate choice identity");
  for (const r of records.filter((r) => r.kind === "class"))
    for (const [level, ids] of Object.entries(r.signatures))
      for (const id of ids) {
        const card = records.find((c) => c.id === id);
        if (card.classId !== r.id || card.minimumLevel !== Number(level))
          throw new Error(`Signature mismatch ${id}`);
      }
  return records.sort((a, b) => a.id.localeCompare(b.id, "en"));
}
