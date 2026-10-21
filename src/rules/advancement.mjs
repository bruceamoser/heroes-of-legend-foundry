import { purchase } from "./development.mjs";
import { acquireAbility, craftingPermissions } from "./acquisition.mjs";
/** Review a draft against the current committed ledger; never mutate the input. */
export function advancementPreview(
  current,
  draft,
  choices,
  inventory,
  languages,
  { knownLanguages } = {},
) {
  let state = structuredClone(current);
  const errors = current.dp < 0 ? [{code:"overspent",text:`Overspent by ${-current.dp} DP. Remove learned abilities to refund their cost.`}] : [],
    ledger = [];
  let maximumHpDelta = 0,
    gritDelta = 0;
  const get = (id) => choices.find((r) => r.id === id);
  const acquire = (id) => {
    const outcome = acquireAbility(
      state,
      id,
      draft.acquisitions?.[id] ?? {},
      inventory,
      { languages, knownLanguages },
    );
    if (!outcome.valid)
      errors.push({
        id,
        code: "acquisition",
        reasons: outcome.errors.map((text) => ({ text })),
      });
    else state = outcome.state;
    Object.assign(state, craftingPermissions(state.abilities, inventory));
  };
  for (const level of current.pendingSignatures ?? []) {
    const id = draft.signatures?.[level],
      cls = get(state.classId);
    if (!cls?.signatures[level]?.includes(id) || state.abilities.includes(id)) {
      errors.push({
        code: "signature",
        level,
        text: `Choose one unlearned level-${level} signature from your class.`,
      });
      continue;
    }
    state.abilities.push(id);
    state.pendingSignatures = state.pendingSignatures.filter(
      (n) => n !== level,
    );
    acquire(id);
    ledger.push({
      kind: "signature-grant",
      level,
      id,
      delta: 0,
      balance: state.dp,
    });
  }
  Object.assign(state, craftingPermissions(state.abilities, inventory));
  for (const [index, entry] of (draft.purchases ?? []).entries()) {
    const choice = get(entry.id),
      outcome = purchase(state, choice, choices, entry);
    if (!outcome.applied) {
      errors.push({
        code: "purchase",
        index,
        id: entry.id,
        reasons: outcome.reasons,
      });
      continue;
    }
    const before = state.dp;
    state = outcome.state;
    if (choice.kind === "ability") acquire(choice.id);
    if (choice.id === "ability-conditioned-body") maximumHpDelta++;
    if (choice.id === "ability-one-more-dawn") {
      state.gritGranted++;
      gritDelta++;
    }
    ledger.push({
      kind: "purchase",
      level: state.level,
      id: entry.id,
      delta: state.dp - before,
      balance: state.dp,
      ...(entry.recipeIds ? { recipeIds: [...entry.recipeIds] } : {}),
    });
  }
  return {
    valid: errors.length === 0,
    errors,
    draft: structuredClone(draft),
    state,
    ledger,
    maximumHpDelta,
    gritDelta,
  };
}

/** Commit one earned signature without touching other tiers or saved purchases. */
export function signatureChoicePreview(current, {level, id, selection = {}}, choices, inventory, languages) {
  const cls = choices.find(choice => choice.id === current.classId && choice.kind === "class");
  const available = [3,7].includes(level) && level <= current.level &&
    (current.pendingSignatures ?? []).includes(level) && cls?.signatures[level]?.includes(id) && !current.abilities.includes(id);
  if (!available) return {valid:false, state:structuredClone(current), errors:[{code:"signature",level,text:`Choose an unlearned level-${level} signature from your class.`}],ledger:[],maximumHpDelta:0,gritDelta:0};
  const preview = advancementPreview({...current,pendingSignatures:[level]}, {purchases:[],signatures:{[level]:id},acquisitions:{[id]:selection}}, choices, inventory, languages);
  preview.state.pendingSignatures = (current.pendingSignatures ?? []).filter(tier => tier !== level);
  return preview;
}
