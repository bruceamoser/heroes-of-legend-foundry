/** Reviewed adapters only; a source hash change requires a new review. */
export const ABILITY_DEFINITIONS = Object.freeze({
  "ability-disengage": Object.freeze({
    id: "ability-disengage",
    name: "Disengage",
    category: "maneuver",
    handler: "disengage-v1",
    source: {
      path: "design/cards/disengage.md",
      sha256:
        "ba3f17a907f80b63cd1e3de0a8cbd52b5ef51ed82b8fd9f974d49b3d05f89eb0",
    },
    summary:
      "**Action:** Maneuver \u00b7 **Attribute:** None \u2014 no roll **Target / range / shape:** Self Your voluntary movement does not provoke opportunity attacks for the rest of this turn. **Duration:** Remainder of this turn **Equipment / acquisition:** None.",
  }),
  "ability-catch-that": Object.freeze({
    id: "ability-catch-that",
    name: "Catch That!",
    category: "reaction",
    handler: "catch-that-v1",
    source: {
      path: "design/cards/catch-that.md",
      sha256:
        "1357adb03d1908f65677f9ace8af3429cc7949aa2d01b048ab157806801ada6d",
    },
    summary:
      "**Action:** Reaction \u00b7 **Attribute:** None \u2014 no roll **Target / range / shape:** One falling, unattended item in your square or an adjacent square, within reach. Before it lands or falls out of reach. Catch the item in a free hand. It must be small enough to hold in that hand. This cannot intercept an attack or take an item another creature is holding. **Duration:** Instant. **Equipment / acquisition:** None.",
  }),
  "ability-look-over-here": Object.freeze({
    id: "ability-look-over-here",
    name: "Look Over Here!",
    category: "reaction",
    handler: "look-over-here-v1",
    source: {
      path: "design/cards/look-over-here.md",
      sha256:
        "9d24dd5315f74fcdac6e6fdcc2539c39350b12c51c3e89ab55c7af7377e0eb7a",
    },
    summary:
      "**Action:** Reaction \u00b7 **Attribute:** None \u2014 no roll **Target / range / shape:** One ally about to make a defense roll against a sight-dependent attack declared by an adjacent enemy that can see you. Before the roll. Grant the ally 1 Boon to that defense roll. This momentary distraction does not create cover, make anyone Hidden or cancel the attack. Apply the normal Boon/Bane rules. **Duration:** The triggering defense roll. **Equipment / acquisition:** None.",
  }),
  "ability-quick-exit": Object.freeze({
    id: "ability-quick-exit",
    name: "Quick Exit",
    category: "passive",
    handler: "quick-exit-v1",
    source: {
      path: "design/cards/quick-exit.md",
      sha256:
        "ac39f0fa207de2ac448f4f09c2cd88d019076a2b27e7e12b85b2123d85d3e06e",
    },
    summary:
      "**Action:** Passive \u00b7 **Attribute:** None \u2014 no roll **Target / range / shape:** Self, when you use Disengage. Once per turn when you use Disengage, gain 1 additional square of available movement for this turn. Spend it using normal terrain costs and movement restrictions. This does not increase Speed or add movement to each allowance gained by converting actions. Disengage\u2019s protection from opportunity attacks applies normally. **Duration:** Until the end of this turn; unused movement expires. **Equipment / acquisition:** None.",
  }),
  "ability-a-party-piece": Object.freeze({
    id: "ability-a-party-piece",
    name: "A Party Piece",
    category: "passive",
    handler: "a-party-piece-v1",
    source: {
      path: "design/cards/a-party-piece.md",
      sha256:
        "d226d826279d2b7be98b4edd737619c9980bdfa4381ae42e447f8877d0ffed8d",
    },
    summary:
      "**Action:** Passive · **Attribute:** None — no roll. While playing the ordinary instrument you own and chose when learning this ability, gain 1 Boon to any Guile roll the music carries, including performance, persuasion and deception. The chosen instrument must be in your hands and in playing condition. Ordinary performances without uncertain consequences need no roll. **Duration:** While playing the chosen instrument. **Equipment / acquisition:** Requires an ordinary Musical Instrument (Bulk 1); grants none.",
  }),
  "ability-basic-melee": Object.freeze({
    id: "ability-basic-melee",
    name: "Basic Melee",
    category: "main",
    handler: "player-basic-melee-v1",
    source: {
      path: "design/cards/basic-melee.md",
      sha256:
        "9d6e0b6ca75363b94c6886fb3c53087f854098f024aac232395c61fdc438ae40",
    },
    attribute: "brawn",
    target: Object.freeze({
      actorTypes: Object.freeze(["character", "creature"]),
      count: 1,
      adjacent: true,
      kind: "creature",
    }),
    requirement: Object.freeze({
      equipment: "held-compatible-melee-weapon",
      grants: Object.freeze([]),
    }),
    damage: Object.freeze({
      type: "physical",
      weak: 2,
      standard: 3,
      strong: 5,
    }),
    summary:
      "Spend one Main Action to make one Brawn attack roll with a held melee weapon against one adjacent creature. Apply only 2/3/5 Physical damage for Weak/Standard/Strong. This reference grants no weapon.",
  }),
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
  "ability-high-guard": Object.freeze({
    id: "ability-high-guard",
    name: "High Guard",
    category: "reaction",
    handler: "high-guard-v1",
    source: {
      path: "design/cards/high-guard.md",
      sha256:
        "26797506110ac809f89b97aa11617766fe883ebe416c6b63346574819e706418",
    },
    summary:
      "Before a shield-blockable defense while holding a shield, spend one Reaction to use Shield Block with 2 defense Boons instead of 1 until the start of your next turn. This replaces the Shield Block benefit rather than adding another. The shield must remain held and the DA judges blockability. Learning supplies an ordinary shield (Bulk 1) if needed.",
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
    : "Rules reference · resolve effects at the table";
}
