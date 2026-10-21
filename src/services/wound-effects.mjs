import { woundContributionPlan, woundRecovered } from "../rules/wound-contributions.mjs";
const ID = "heroes-of-legend";

function legacyInjury(effect, wound) {
  if (wound?.injury) return wound.injury;
  const separator = effect.name?.indexOf(" · ");
  return separator >= 0 ? effect.name.slice(0, separator) : effect.name;
}

/**
 * Snapshot only native ActiveEffects that can emit lasting wound consequences.
 * Foundry's computed `active` state also excludes expired effects.
 */
export function nativeWoundEffects(actor) {
  if (!actor?.effects || !actor.getFlag)
    throw new Error("A native Actor with ActiveEffects is required.");
  const wounds = actor.getFlag(ID, "wounds") ?? {};
  return Array.from(actor.effects, (effect) => {
    const modifier = effect.getFlag(ID, "woundModifier");
    if (modifier === undefined) return null;
    const woundEventId = effect.getFlag(ID, "woundEvent"),
      wound = woundEventId ? wounds[woundEventId] : null,
      catalogEffect = wound?.effects?.find(
        (candidate) =>
          candidate.kind === modifier.kind &&
          candidate.context === modifier.context &&
          candidate.polarity === modifier.polarity &&
          candidate.amount === modifier.amount,
      ),
      printedContext =
        modifier.printedContext ?? catalogEffect?.printedContext;
    return {
      id: effect.id,
      name: effect.name,
      active: effect.active === true && !effect.getFlag(ID,"retired") && !woundRecovered(wound),
      disabled: effect.disabled === true,
      flags: {
        [ID]: {
          woundEvent: woundEventId,
          woundModifier: {
            ...structuredClone(modifier),
            injury: modifier.injury ?? legacyInjury(effect, wound),
            woundId: modifier.woundId ?? wound?.id ?? null,
            ...(printedContext ? { printedContext } : {}),
            ...(modifier.source === undefined && wound?.source
              ? { source: structuredClone(wound.source) }
              : {}),
          },
        },
      },
    };
  }).filter(Boolean);
}

export function actorWoundContributionPlan(actor) {
  return woundContributionPlan(nativeWoundEffects(actor));
}
