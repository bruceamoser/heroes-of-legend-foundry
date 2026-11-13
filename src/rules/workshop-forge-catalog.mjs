import { DEFAULT_LANGUAGES } from "./languages.mjs";
import { forgeInventory } from "./forge-character.mjs";

const body = (text) => [{ text }];
const details = (fields) => Object.entries(fields)
  .filter(([, value]) => value)
  .map(([label, value]) => ({ label, value }));

export function workshopCatalogs(choices, inventory, wounds, forge, references = {}) {
  const legacyChoices = choices.records;
  const legacy = new Map(legacyChoices.map((record) => [record.id, record]));
  const ancestry = forge.ancestries.map((record) => ({
    ...legacy.get(record.id),
    ...record,
    kind: "ancestry",
    hp: record.hpContribution,
    speed: record.baseSpeed,
    coins: record.coinContribution,
  }));
  const origins = forge.origins.map((record) => ({
    ...record,
    kind: "origin",
    originType: record.kind,
    coins: record.coinContribution,
    pairs: record.pairs.map((pair) => ({ ...pair, abilityId: pair.entryId })),
  }));
  const classes = forge.classes.map((record) => ({
    ...record,
    kind: "class",
    hp: record.hpContribution,
    coins: record.coinContribution,
    startingDisciplines: record.disciplineIds,
  }));
  const nodes = forge.nodes.map((node) => {
    if (node.kind === "discipline" || node.kind === "section") return node;
    const action = node.effect?.match(/^(Main Action|Maneuver|Reaction|Passive|Movement|Ritual|One exchange)(?=\b)/i)?.[1] ??
      (node.effect?.match(/^\d+ (?:minute|hour|day)/i) ? "Timed work" : "Passive");
    const attribute = node.id === "craft:supplies:1" ? "Knowledge" :
      node.effect?.split("\n")[0]?.match(/ · (Brawn|Fortitude|Agility|Guile|Knowledge|Reason)\b/)?.[1];
    return {
      ...node,
      kind: "ability",
      disciplineIds: node.disciplineId ? [node.disciplineId] : (node.disciplineIds ?? node.requires
        .map((id) => forge.nodes.find((entry) => entry.id === id)?.disciplineId).filter(Boolean)),
      reference: node.reference ?? {
        flavor: [],
        rules: { details: details({ Action: action, Attribute: attribute }), body: body(node.effect) },
      },
    };
  });
  return {
    choices: [
      ...ancestry, ...origins, ...classes, ...nodes,
      ...forge.basicActions.map((record) => ({ ...record, kind: "ability", universal: true })),
      ...forge.signatures.map((record) => ({ ...record, kind: "ability" })),
      ...legacyChoices.filter((record) => record.kind === "trait").map((record) => {
        const current = references.records?.[record.id];
        if (!current || current.source.sha256 === record.source.sha256) return record;
        const flavor = current.markdown.match(/^# [^\n]+\n\n\*([^\n]+)\*/)?.[1];
        const ruleText = current.markdown.split(/\n## Rules\s*\n/)[1]?.split(/\n---\n/)[0]?.trim();
        return {
          ...record, ...current,
          reference: {
            flavor: flavor ? [flavor] : [],
            rules: { details: [], body: ruleText?.split(/\n\s*\n/).map((text) => ({ text })) ?? [] },
          },
        };
      }),
    ],
    legacyChoices,
    languages: [...DEFAULT_LANGUAGES, ...["Reed Speech", "River Speech"].map((name) => ({
      id: name.toLowerCase().replace(" ", "-"), name, ordinary: true, form: "spoken", writing: true,
    }))],
    inventory: forgeInventory({
      ...inventory,
      forge: true,
      forge: true,
      equipment: [
        ...inventory.equipment.map((item) => references.equipment?.find((record) => record.id === item.id) ?? item),
        ...(references.equipment ?? []).filter((item) => !inventory.equipment.some((record) => record.id === item.id)),
      ],
    }, forge),
    wounds,
    forge,
    commit: forge.sourceCommit,
  };
}
