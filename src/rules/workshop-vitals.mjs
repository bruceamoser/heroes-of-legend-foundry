import { classifyRoll } from "./roll.mjs";

/** Browser play has no encounter clock; the table decides when to roll. */
export function workshopDeathResult({
  failed = 0,
  hp = 0,
  retained,
  fortitude,
}) {
  if (!Number.isSafeInteger(failed) || failed < 0 || failed > 3)
    throw new Error("Use 0–3 failed death rolls.");
  const result = classifyRoll(retained, fortitude);
  if (result.natural === "critical")
    return {
      failed: 0,
      hp: Math.max(1, hp),
      outcome: "Regain 1 HP; death marks cleared.",
    };
  if (result.tier === "strong")
    return { failed: 0, hp, outcome: "Stabilized; death marks cleared." };
  const marks = Math.min(
    3,
    failed + (result.natural === "fumble" ? 2 : result.tier === "weak" ? 1 : 0),
  );
  return {
    failed: marks,
    hp,
    outcome:
      marks === 3
        ? "Last Words: speech only; death at the end of the second following turn."
        : marks > failed
          ? "Death mark added."
          : "No additional death mark.",
  };
}

export function workshopVitals(character, draft) {
  const max = character.summary?.maximumHp ?? 0;
  const maxSpeed = character.summary?.unencumberedSpeed ?? 0;
  const speed = Math.max(
    0,
    (character.summary?.speed ?? 0) -
      character.play.conditionSummary.slowed.rating,
  );
  return {
    max,
    hp: Math.min(max, draft.play?.hp ?? max),
    maxSpeed,
    speed,
    wounds: draft.play?.wounds ?? [],
    failed: draft.play?.failedDeathRolls ?? 0,
  };
}
