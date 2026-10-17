export const ATTRIBUTES = Object.freeze(["brawn", "fortitude", "agility", "guile", "knowledge", "reason"]);

export function validateCharacter(data) {
  if (data.health.value > data.health.baseMax) throw new Error("Current HP cannot exceed maximum HP.");
  if (data.grit.spent > data.grit.granted) throw new Error("Spent Grit cannot exceed granted Grit.");
}

export function characterSummary(data) {
  return {
    attributeTotal: ATTRIBUTES.reduce((sum, key) => sum + data.attributes[key].base, 0),
    healthMax: data.health.baseMax,
    gritAvailable: data.grit.granted - data.grit.spent
  };
}
