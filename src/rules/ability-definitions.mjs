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
        "6abb6ec369854c42e2b60794b392736704253d5d674ac7de7f691d4aaf5e56c8",
    },
    equivalentSourceHashes: [
      "4b6b966f65bfa42de13376549dd2d2d43bc694b3695ed12329f2ad4652ba93ba",
    ],
    summary:
      "Spend one Maneuver to gain one Boon to defense rolls until the start of your next turn. Repeating this benefit does not increase it.",
  }),
  "ability-shield-block": Object.freeze({
    id: "ability-shield-block",
    name: "Shield Block",
    category: "reaction",
    handler: "shield-block-v1",
    source: {
      path: "design/cards/shield-block.md",
      sha256:
        "bd890d5b177b2c0eded18b75901adba56c0162c25f7f6a4710298cd662421e94",
    },
    summary:
      "Before an eligible blockable defense while holding a shield, spend one Reaction to gain one defense Boon until the start of your next turn. This does not grant a shield and does not stack with itself.",
  }),
});
export function abilityDefinition(id, source) {
  const definition = ABILITY_DEFINITIONS[id];
  if (!definition) return null;
  if (
    source?.path !== definition.source.path ||
    (source?.sha256 !== definition.source.sha256 &&
      !definition.equivalentSourceHashes?.includes(source?.sha256))
  )
    throw new Error(
      "This ability's source changed; its automation needs review.",
    );
  return definition;
}
export function abilityReferenceStatus(id, source) {
  return abilityDefinition(id, source)
    ? "Reviewed native action · rules reference"
    : "Rules reference · play automation in progress";
}
