import { purchase } from "./development.mjs";
import { signatureTierState, pendingSignatureTiers, activeAbilityGrant } from "./signatures.mjs";
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
  const pending=[...new Set([...(current.pendingSignatures??[]),...Object.keys(draft.signatures??{}).map(Number)])].filter(level=>signatureTierState(current,level,choices).pending);
  state.pendingSignatures=pending;
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
  for (const level of pending) {
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
    state.signatureChoices={...(state.signatureChoices??{}),[level]:id};
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

/** Commit or switch one free slot without touching paid choices or other tiers. */
export function signatureChoicePreview(current, {level, id, previousId = null, selection = {}}, choices, inventory, languages) {
  const tier=signatureTierState(current,level,choices);
  const signature={level,previousId:tier.selectedId,selectedId:id,removeAbilityIds:[],unchanged:tier.selectedId===id};
  const invalid=text=>({valid:false,state:structuredClone(current),errors:[{code:"signature",level,text}],ledger:[],maximumHpDelta:0,gritDelta:0,signature});
  if(!tier.earned||!tier.optionIds.includes(id))return invalid(`Choose an earned level-${level} signature from your class.`);
  if(tier.ambiguous){
    if(!tier.ownedIds.includes(previousId)||tier.paidIds.includes(previousId))return invalid("Identify the current free signature before switching.");
    signature.previousId=previousId;signature.unchanged=false;
  }else if(previousId&&previousId!==tier.selectedId)return invalid("The current signature changed. Review this choice again.");
  let state=structuredClone(current);
  state.signatureChoices={...(state.signatureChoices??{}),[level]:id};
  if(level===1)state.creation={...(state.creation??{}),signatureId:id};
  if(signature.previousId&&signature.previousId!==id&&!tier.paidIds.includes(signature.previousId)&&!state.ledger?.some(entry=>activeAbilityGrant(state,entry,signature.previousId))){
    state.abilities=state.abilities.filter(ability=>ability!==signature.previousId);
    signature.removeAbilityIds=[signature.previousId];
  }
  if(!state.abilities.includes(id)){
    state.abilities.push(id);
    const acquisition=acquireAbility(state,id,selection,inventory,{languages});
    if(!acquisition.valid)return {valid:false,state,errors:[{code:"acquisition",id,reasons:acquisition.errors.map(text=>({text}))}],ledger:[],maximumHpDelta:0,gritDelta:0,signature};
    state=acquisition.state;
  }
  Object.assign(state,craftingPermissions(state.abilities,inventory));
  state.pendingSignatures=pendingSignatureTiers(state,choices);
  const ledger=signature.unchanged?[]:[{kind:signature.previousId?"signature-switch":"signature-grant",level,id,...(signature.previousId?{fromId:signature.previousId}:{}),delta:0,balance:state.dp}];
  return {valid:true,state,errors:[],ledger,maximumHpDelta:0,gritDelta:0,signature};
}
