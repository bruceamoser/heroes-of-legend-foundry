import { DAMAGE_TYPE } from "./damage.mjs";
import { isSummon, summonRecord, summonSystemFromRecord } from "./summon-profile.mjs";

/** One sheet projection for standard creatures and summon-flagged creatures. */
export function creatureSheetProfile(actor) {
  if (!isSummon(actor)) return actor.system;
  const system = summonSystemFromRecord(summonRecord(actor));
  return {
    ...system,
    armor: 0,
    evasion: system.defenseModifier,
    threat: { boons: 0, banes: 0 },
    size: system.footprint.width,
    sizeLabel: `${system.footprint.width} × ${system.footprint.height}`,
    basicMelee: {
      ...system.basicMelee,
      defenseAttribute: system.basicMelee.attribute,
    },
    actions: {
      entries: system.attacks.map((attack, index) => ({
        id: `summon-attack-${index}`,
        name: attack.name,
        category: "main",
        attributeKey: attack.attribute,
        defenseSource:
          attack.attribute[0].toUpperCase() + attack.attribute.slice(1),
        outcomes: {
          weak: attack.weak,
          standard: attack.standard,
          strong: attack.strong,
        },
        hasOutcomes: true,
        effect: "",
        referenceMarkdown: system.referenceMarkdown,
      })),
    },
  };
}

/** Summon profiles print attacker outcomes. Keep their order and attribute intact. */
export function summonAttackConfiguration(actor, id = "basic-melee") {
  if (!isSummon(actor)) throw new Error("Choose a summoned creature.");
  const system = summonSystemFromRecord(summonRecord(actor));
  const attack =
    id === "basic-melee"
      ? system.basicMelee
      : /^summon-attack-\d+$/.test(id)
        ? system.attacks[Number(id.slice(14))]
        : null;
  if (!attack) throw new Error("This creature attack is unavailable.");
  return {
    name: attack.name ?? "Basic Melee",
    attribute: attack.attribute,
    attack: true,
    ranged: false,
    weaponKind: null,
    damageTypes: [],
    trigger: "",
    summonActionId: id,
    effect: "",
    outcomes: Object.fromEntries(
      ["weak", "standard", "strong"].map((tier) => [
        tier,
        typeof attack[tier] === "number"
          ? `${attack[tier]} ${DAMAGE_TYPE.PHYSICAL} damage.`
          : attack[tier],
      ]),
    ),
    attackModifier: {
      boons: attack.attackModifier.boons,
      banes: attack.attackModifier.banes,
    },
  };
}
