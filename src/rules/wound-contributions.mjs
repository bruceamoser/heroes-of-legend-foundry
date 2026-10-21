const ID = "heroes-of-legend";
const IDENTITY = /^[A-Za-z0-9_-]{1,80}$/;
const ROLL_CONTEXTS = Object.freeze({
  physical: "physical activities",
  mental: "mental activities",
  intimidate: "intimidate",
  persuade: "persuade when the injury influences interaction",
});
const APPLICABILITY = Object.freeze(["applies", "does-not-apply"]);

function identity(value, label) {
  if (typeof value !== "string" || !IDENTITY.test(value))
    throw new Error(`${label} must be a stable identity.`);
  return value;
}

function text(value, label) {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${label} must be printed source text.`);
  return value.trim();
}

function integer(value, label, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new Error(
      `${label} must be a whole number from ${minimum} to ${maximum}.`,
    );
  return value;
}

function provenance(modifier, flags) {
  const result = {
    effectId: identity(modifier.effectId, "Wound effect identity"),
    woundEventId: identity(
      modifier.woundEventId ?? flags.woundEvent,
      "Wound event identity",
    ),
    woundId:
      modifier.woundId === null
        ? null
        : identity(modifier.woundId, "Wound identity"),
    injury: text(modifier.injury, "Wound injury"),
  };
  if (modifier.source !== undefined)
    result.source = structuredClone(modifier.source);
  if (modifier.sourceCommit !== undefined)
    result.sourceCommit = text(modifier.sourceCommit, "Wound source commit");
  return result;
}

function rollContext(modifier) {
  const fallback = ROLL_CONTEXTS[modifier.context];
  if (modifier.printedContext === undefined) return fallback;
  const printed = text(modifier.printedContext, "Printed wound context");
  if (
    modifier.context === "persuade" &&
    !/^persuade when (visible scar|scar|it) influences interaction$/.test(
      printed,
    )
  )
    throw new Error("The printed persuasion context changed.");
  if (modifier.context !== "persuade" && printed !== fallback)
    throw new Error("The printed wound context changed.");
  return printed;
}

function uniqueLabels(entries) {
  const totals = new Map(),
    seen = new Map();
  for (const entry of entries)
    totals.set(entry.baseLabel, (totals.get(entry.baseLabel) ?? 0) + 1);
  for (const entry of entries) {
    const count = (seen.get(entry.baseLabel) ?? 0) + 1;
    seen.set(entry.baseLabel, count);
    entry.label =
      totals.get(entry.baseLabel) === 1
        ? entry.baseLabel
        : `${entry.baseLabel} [${count}]`;
    delete entry.baseLabel;
  }
}

/**
 * Convert native-effect snapshots into validated lasting wound consequences.
 * Native documents must supply `active`, `disabled`, `name`, `id` and flags.
 */
export function woundContributionPlan(effects) {
  if (!Array.isArray(effects))
    throw new Error("Wound effects must be an array.");
  const seen = new Set(),
    rollModifiers = [],
    movementSources = [];
  let movementPenalty = 0;
  for (const effect of effects) {
    if (!effect || typeof effect !== "object" || Array.isArray(effect))
      throw new Error("Invalid native wound effect.");
    const effectId = identity(effect.id, "ActiveEffect identity");
    if (seen.has(effectId))
      throw new Error("Wound effect identities must be unique.");
    seen.add(effectId);
    if (typeof effect.active !== "boolean")
      throw new Error("A native wound effect needs active state.");
    if (effect.disabled !== undefined && typeof effect.disabled !== "boolean")
      throw new Error("A native wound effect needs valid disabled state.");
    if (!effect.active || effect.disabled === true) continue;
    const flags = effect.flags?.[ID],
      modifier = flags?.woundModifier;
    if (modifier === undefined) continue;
    if (!modifier || typeof modifier !== "object" || Array.isArray(modifier))
      throw new Error("A wound modifier must be a typed contribution.");
    const source = provenance({ ...modifier, effectId }, flags);
    if (modifier.kind === "movementPenalty") {
      const amount = integer(modifier.amount, "Movement penalty", 1, 4),
        baseLabel = `Wound: ${source.injury} · movement`;
      movementPenalty = integer(
        movementPenalty + amount,
        "Combined movement penalty",
        0,
      );
      movementSources.push({
        ...source,
        amount,
        baseLabel,
      });
      continue;
    }
    if (modifier.kind !== "rollModifier")
      throw new Error("Unknown lasting wound modifier.");
    if (!Object.hasOwn(ROLL_CONTEXTS, modifier.context))
      throw new Error("Unknown wound roll context.");
    if (!["boon", "bane"].includes(modifier.polarity))
      throw new Error("A wound roll modifier needs Boon or Bane polarity.");
    if (modifier.requiresContext !== true)
      throw new Error("A wound roll modifier must require contextual application.");
    const amount = integer(modifier.amount, "Wound Boon/Bane", 1, 3),
      printedContext = rollContext(modifier),
      baseLabel = `Wound: ${source.injury} · ${printedContext}`;
    rollModifiers.push({
      id: `wound-roll-${source.effectId}`,
      ...source,
      kind: "rollModifier",
      polarity: modifier.polarity,
      amount,
      context: modifier.context,
      printedContext,
      requiresContext: true,
      contextual: true,
      label: baseLabel,
      baseLabel,
      sourceIds: [source.effectId],
    });
  }
  movementSources.sort(
    (a, b) =>
      a.effectId.localeCompare(b.effectId) ||
      a.woundEventId.localeCompare(b.woundEventId),
  );
  rollModifiers.sort(
    (a, b) =>
      a.effectId.localeCompare(b.effectId) ||
      a.context.localeCompare(b.context),
  );
  uniqueLabels(rollModifiers);
  uniqueLabels(movementSources);
  return {
    rollModifiers,
    movement: {
      penalty: movementPenalty,
      sources: movementSources,
    },
  };
}

/**
 * Apply only explicit wound choices, then return sources for ordinary
 * Boon/Bane cancellation. Unknown choices identify a stale dialog snapshot.
 */
export function selectedWoundRollSources(modifiers, applicability = {}) {
  if (!Array.isArray(modifiers))
    throw new Error("Wound roll modifiers must be an array.");
  if (
    !applicability ||
    typeof applicability !== "object" ||
    Array.isArray(applicability)
  )
    throw new Error("Wound applicability choices must be an object.");
  const byId = new Map();
  for (const modifier of modifiers) {
    if (!modifier || typeof modifier !== "object")
      throw new Error("Invalid wound roll modifier.");
    identity(modifier.effectId, "Wound effect identity");
    identity(modifier.id, "Wound roll source identity");
    if (byId.has(modifier.effectId))
      throw new Error("Wound roll source identities must be unique.");
    byId.set(modifier.effectId, modifier);
  }
  for (const [effectId, choice] of Object.entries(applicability)) {
    if (!byId.has(effectId) && choice)
      throw new Error(
        "Wound sources changed while this roll was open. Review them again.",
      );
    if (choice && !APPLICABILITY.includes(choice))
      throw new Error("Choose whether each wound modifier applies.");
  }
  const sources = [];
  for (const modifier of modifiers) {
    const choice = applicability[modifier.effectId];
    if (!APPLICABILITY.includes(choice))
      throw new Error("Choose whether each wound modifier applies.");
    if (choice === "does-not-apply") continue;
    sources.push({
      id: identity(modifier.id, "Wound roll source identity"),
      kind: modifier.polarity,
      amount: integer(modifier.amount, "Wound Boon/Bane", 1, 3),
      label: text(modifier.label, "Wound source label"),
      automatic: false,
      contextual: true,
      sourceIds: structuredClone(modifier.sourceIds),
      wound: {
        effectId: modifier.effectId,
        woundEventId: modifier.woundEventId,
        woundId: modifier.woundId,
        injury: modifier.injury,
        context: modifier.context,
        printedContext: modifier.printedContext,
        source: structuredClone(modifier.source ?? null),
        sourceCommit: modifier.sourceCommit ?? null,
      },
    });
  }
  return sources;
}

/** Start broad physical/mental penalties on their matching roll family. The table
 * can clear the visible checkbox when that activity does not use the injury. */
export function defaultWoundApplicability(modifier,{mode='attribute',attributeKey,ability}={}) {
  if(mode==='death')return 'does-not-apply';
  if(modifier.context==='physical'&&['brawn','fortitude','agility'].includes(attributeKey))return 'applies';
  if(modifier.context==='mental'&&['guile','knowledge','reason'].includes(attributeKey))return 'applies';
  if(modifier.context==='intimidate'&&/\bintimidat/i.test(ability?.name??''))return 'applies';
  return 'does-not-apply';
}
/** Human-readable effect text shared by recorded-wound displays. */
export function describeWoundEffect(effect) {
  const modifier=effect?.getFlag?.(ID,'woundModifier')??effect?.flags?.[ID]?.woundModifier??effect;
  const condition=effect?.getFlag?.(ID,'condition')??effect?.flags?.[ID]?.condition;
  if(condition)return `${condition.key} ${condition.rating}${condition.persistence==='starred'?'*':''}`;
  if(modifier?.kind==='rollModifier')return `${modifier.amount} ${modifier.polarity==='bane'?'Bane':'Boon'}${modifier.amount===1?'':'s'} · ${modifier.printedContext??ROLL_CONTEXTS[modifier.context]??modifier.context}`;
  if(modifier?.kind==='movementPenalty')return `Movement −${modifier.amount}`;
  if(modifier?.kind==='condition')return `${modifier.key} ${modifier.rating}${modifier.persistence==='starred'?'*':''}`;
  if(modifier?.kind==='forcedMovement')return `${modifier.direction} ${modifier.distance} square${modifier.distance===1?'':'s'}`;
  if(modifier?.kind==='lastWords')return 'Last Words';
  return effect?.name??'';
}
