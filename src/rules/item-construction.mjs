import {
  abilityDefinition,
  abilityReferenceStatus,
} from "./ability-definitions.mjs";

export const SYSTEM_ID = "heroes-of-legend";
export const ITEM_SCHEMA_VERSION = 1;
export const EQUIPMENT_AUTOMATION_LABEL =
  "Market reference · acquisition and use automation in progress";

const HTML_ESCAPES = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

export function escapeItemHtml(value) {
  if (typeof value !== "string")
    throw new Error("Item reference text must be a string.");
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

function sourceProvenance(source, manifest) {
  if (
    typeof source?.path !== "string" ||
    !source.path ||
    typeof source.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(source.sha256)
  )
    throw new Error("Item source provenance is invalid.");
  if (
    typeof manifest !== "string" ||
    !/^[a-f0-9]{40}$/.test(manifest)
  )
    throw new Error("Item source commit is invalid.");
  return {
    path: source.path,
    sha256: source.sha256,
  };
}

function sourceLink(source, manifest) {
  if (
    source.path.startsWith("/") ||
    /[\\:%?#]/.test(source.path) ||
    source.path
      .split("/")
      .some((part) => !part || part === "." || part === "..")
  )
    throw new Error(`Unsafe item source path: ${source.path}`);
  const path = source.path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `<a href="https://github.com/bruceamoser/heroes-of-legend/blob/${manifest}/${path}" target="_blank" rel="noopener">${escapeItemHtml(source.path)}</a>`;
}

function detailHtml(details) {
  if (!Array.isArray(details))
    throw new Error("Ability reference details must be an array.");
  return `<dl class="hol-reference-details">${details
    .map((detail) => {
      if (
        typeof detail?.label !== "string" ||
        !detail.label ||
        typeof detail.value !== "string" ||
        !detail.value
      )
        throw new Error("Ability reference detail is incomplete.");
      return `<div><dt>${escapeItemHtml(detail.label)}</dt><dd>${escapeItemHtml(detail.value)}</dd></div>`;
    })
    .join("")}</dl>`;
}

function rulesBodyHtml(blocks) {
  if (!Array.isArray(blocks))
    throw new Error("Ability reference rules must be an array.");
  return blocks
    .map((block) => {
      if (Array.isArray(block?.outcomes))
        return `<dl class="hol-reference-outcomes">${block.outcomes
          .map((outcome) => {
            if (
              typeof outcome?.label !== "string" ||
              typeof outcome.text !== "string"
            )
              throw new Error("Ability reference outcome is incomplete.");
            return `<dt>${escapeItemHtml(outcome.label)}</dt><dd>${escapeItemHtml(outcome.text)}</dd>`;
          })
          .join("")}</dl>`;
      if (Array.isArray(block?.items))
        return `<ul>${block.items
          .map((item) => `<li>${escapeItemHtml(item)}</li>`)
          .join("")}</ul>`;
      if (typeof block?.text === "string")
        return `<p>${escapeItemHtml(block.text)}</p>`;
      throw new Error("Ability reference rule block is unsupported.");
    })
    .join("");
}

function notesHtml(notes) {
  if (!Array.isArray(notes))
    throw new Error("Ability reference notes must be an array.");
  return notes
    .map((note) => {
      if (typeof note?.text !== "string")
        throw new Error("Ability reference note is incomplete.");
      const label =
        note.label === null
          ? ""
          : `<strong>${escapeItemHtml(note.label)}:</strong> `;
      return `<p>${label}${escapeItemHtml(note.text)}</p>`;
    })
    .join("");
}

export function abilityReferenceHtml(
  reference,
  { source, sourceCommit, automationLabel },
) {
  if (!Array.isArray(reference?.flavor) || !reference.flavor.length)
    throw new Error("Ability reference flavor is missing.");
  const provenance = sourceProvenance(source, sourceCommit);
  const flavor = reference.flavor
    .map((text) => `<p>${escapeItemHtml(text)}</p>`)
    .join("");
  const notes = notesHtml(reference.rules?.notes);
  return [
    '<section class="hol-item-reference">',
    `<p class="hol-automation-label"><strong>Automation:</strong> ${escapeItemHtml(automationLabel)}</p>`,
    `<div class="hol-reference-flavor">${flavor}</div>`,
    "<h2>Rules</h2>",
    detailHtml(reference.rules?.details),
    `<div class="hol-reference-rules">${rulesBodyHtml(reference.rules?.body)}</div>`,
    notes ? `<h3>Additional rulings</h3>${notes}` : "",
    `<p class="hol-reference-source"><strong>Source:</strong> ${sourceLink(provenance, sourceCommit)} at <code>${escapeItemHtml(sourceCommit)}</code>.</p>`,
    "</section>",
  ].join("");
}

export function equipmentReferenceHtml(
  record,
  { sourceCommit, automationLabel = EQUIPMENT_AUTOMATION_LABEL },
) {
  const source = sourceProvenance(record?.source, sourceCommit);
  const supply =
    Number.isSafeInteger(record.inventoryDie) && record.inventoryDie > 0
      ? `<p><strong>Normal supply die:</strong> d${record.inventoryDie}.</p>`
      : "";
  return [
    '<section class="hol-item-reference">',
    `<p class="hol-automation-label"><strong>Automation:</strong> ${escapeItemHtml(automationLabel)}</p>`,
    `<p><strong>Market price:</strong> ${escapeItemHtml(String(record.price))} coins${record.specialOrder ? "; special order" : ""}.</p>`,
    supply,
    `<p class="hol-reference-source"><strong>Source:</strong> ${sourceLink(source, sourceCommit)} at <code>${escapeItemHtml(sourceCommit)}</code>.</p>`,
    "</section>",
  ].join("");
}

function abilitySystem(description, definition) {
  return {
    schemaVersion: ITEM_SCHEMA_VERSION,
    description,
    activity: {
      action: definition?.category ?? "main",
      rollMode: definition?.attribute ? "attribute" : "none",
      attribute: definition?.attribute ?? "brawn",
      defenseAttribute: "agility",
    },
    outcomes: {
      weak: "",
      standard: "",
      strong: "",
    },
  };
}

function equipmentSystem(record, description, options) {
  return {
    schemaVersion: ITEM_SCHEMA_VERSION,
    catalogId: record.id,
    quantity: options.quantity ?? 1,
    bulk: record.bulk,
    hands: options.hands ?? 0,
    inventoryDie:
      options.inventoryDie === undefined
        ? (record.inventoryDie ?? 0)
        : options.inventoryDie,
    held: options.held ?? false,
    worn: options.worn ?? false,
    description,
  };
}

function grantFlags(options) {
  const flags = {};
  if (typeof options.creationGrant === "boolean")
    flags.creationGrant = options.creationGrant;
  if (typeof options.grantKind === "string")
    flags.grantKind = options.grantKind;
  if (typeof options.acquisitionInstance === "string")
    flags.acquisitionInstance = options.acquisitionInstance;
  return flags;
}

export function abilityItemSource(
  record,
  {
    sourceCommit,
    creationGrant,
    grantKind,
    acquisitionInstance,
    description = null,
  } = {},
) {
  if (record?.kind !== "ability")
    throw new Error(`Expected an ability record: ${record?.id}`);
  const source = sourceProvenance(record.source, sourceCommit);
  const definition = abilityDefinition(record.id, source);
  const automationLabel = abilityReferenceStatus(record.id, source);
  const reference =
    description ??
    abilityReferenceHtml(record.reference, {
      source,
      sourceCommit,
      automationLabel,
    });
  return {
    name: record.name,
    type: "ability",
    system: abilitySystem(reference, definition),
    flags: {
      [SYSTEM_ID]: {
        ...grantFlags({
          creationGrant,
          grantKind,
          acquisitionInstance,
        }),
        catalogId: record.id,
        source,
        sourceCommit,
        catalogAutomation: record.automation,
        automation: definition ? "reviewed" : record.automation,
        automationLabel,
        ...(definition ? { handler: definition.handler } : {}),
      },
    },
  };
}

export function equipmentItemSource(
  record,
  {
    sourceCommit,
    creationGrant,
    grantKind,
    acquisitionInstance,
    description = null,
    quantity,
    hands,
    inventoryDie,
    held,
    worn,
  } = {},
) {
  if (!record?.id?.startsWith("item-"))
    throw new Error(`Expected equipment record: ${record?.id}`);
  const source = sourceProvenance(record.source, sourceCommit);
  const reference =
    description ??
    equipmentReferenceHtml(record, {
      sourceCommit,
      automationLabel: EQUIPMENT_AUTOMATION_LABEL,
    });
  return {
    name: record.name,
    type: "equipment",
    system: equipmentSystem(record, reference, {
      quantity,
      hands,
      inventoryDie,
      held,
      worn,
    }),
    flags: {
      [SYSTEM_ID]: {
        ...grantFlags({
          creationGrant,
          grantKind,
          acquisitionInstance,
        }),
        source,
        sourceCommit,
        catalogAutomation: record.automation,
        automation: record.automation,
        automationLabel: EQUIPMENT_AUTOMATION_LABEL,
      },
    },
  };
}

export function authoredItemDocument(item, id) {
  if (typeof id !== "string" || !/^[a-f0-9]{16}$/.test(id))
    throw new Error(`Invalid Foundry Item ID: ${id}`);
  return {
    _key: `!items!${id}`,
    _id: id,
    name: item.name,
    type: item.type,
    system: item.system,
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: item.flags,
  };
}
