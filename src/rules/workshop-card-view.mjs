export function abilityHeaderBadges(record) {
  const action =
    record.reference?.rules.details.find((d) => d.label === "Action")?.value ??
    "";
  const codes = [
    [/Main Action/i, "A"],
    [/Maneuver/i, "M"],
    [/Reaction/i, "R"],
    [/Passive/i, "P"],
  ]
    .filter(([pattern]) => pattern.test(action))
    .map(([, code]) => code);
  return {
    action,
    codes,
    disciplines: (record.requirements ?? [])
      .filter((r) => r.kind === "discipline")
      .map((r) => ({ id: r.id, rank: r.rank })),
  };
}
