/** Reviewed adapters only; a source hash change requires a new review. */
export const ABILITY_DEFINITIONS = Object.freeze({
  "ability-defend": Object.freeze({
    id: "ability-defend",
    name: "Defend",
    category: "maneuver",
    handler: "defend-v1",
    source: {
      path: "design/cards/defend.md",
      sha256:
        "4b6b966f65bfa42de13376549dd2d2d43bc694b3695ed12329f2ad4652ba93ba",
    },
    summary:
      "Spend one Maneuver to gain one Boon to defense rolls until the start of your next turn. Repeating this benefit does not increase it.",
  }),
});
export function abilityDefinition(id, source) {
  const definition = ABILITY_DEFINITIONS[id];
  if (!definition) return null;
  if (
    source?.path !== definition.source.path ||
    source?.sha256 !== definition.source.sha256
  )
    throw new Error(
      "This ability's source changed; its automation needs review.",
    );
  return definition;
}
