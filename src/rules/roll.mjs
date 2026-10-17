export function rollPlan({ attribute, boons = 0, banes = 0 }) {
  if (!Number.isSafeInteger(attribute)) throw new Error("Attribute must be an integer.");
  for (const value of [boons, banes]) if (!Number.isSafeInteger(value) || value < 0) throw new Error("Boons and Banes must be non-negative integers.");
  const net = Math.max(-3, Math.min(3, boons - banes));
  const count = 3 + Math.abs(net);
  const dice = `${count}d6${net > 0 ? "kh3" : net < 0 ? "kl3" : ""}`;
  return { attribute, boons, banes, canceled: Math.min(boons, banes), net, count,
    formula: `${dice} + (${attribute})` };
}

export function classifyRoll(retained, attribute) {
  if (retained.length !== 3 || retained.some(face => !Number.isInteger(face) || face < 1 || face > 6)) throw new Error("Exactly three retained d6 faces are required.");
  if (!Number.isSafeInteger(attribute)) throw new Error("Attribute must be an integer.");
  const total = retained.reduce((sum, face) => sum + face, attribute);
  const natural = retained.every(face => face === 1) ? "fumble" : retained.every(face => face === 6) ? "critical" : "none";
  const tier = natural === "fumble" ? "weak" : natural === "critical" ? "strong" : total <= 8 ? "weak" : total <= 14 ? "standard" : "strong";
  return { total, tier, natural };
}
