/**
 * Declarative fixed-healing potion plans.
 * A coordinator must authorize and persist every returned action/healing step.
 */
import { continueAction, declareAction } from "./actions.mjs";
import { healingPlan } from "./damage.mjs";
import { handLayout } from "./hands.mjs";
import { receiveHealing, validateSurvival } from "./survival.mjs";
import { inventoryCheck } from "./inventory.mjs";

const SOURCE_COMMIT = "295e858c1b6fee044a0261bf9f437636efeff2bf";
const ACTION = Object.freeze({
  id: "use-a-healing-potion",
  catalogId: "ability-use-a-healing-potion",
  source: Object.freeze({
    id: "use-a-healing-potion",
    repository: "bruceamoser/heroes-of-legend",
    commit: SOURCE_COMMIT,
    path: "design/cards/use-a-healing-potion.md",
    sha256: "210f6e2c84a51dd31f6b44a534f602e703b137eec38cef08697a63d1fdec82ea",
  }),
});

const definitions = {
  "item-lesser-healing-bottle": {
    id: "item-lesser-healing-bottle",
    healing: 6,
    supplyDie: 4,
    source: {
      id: "item-lesser-healing-bottle",
      repository: "bruceamoser/heroes-of-legend",
      commit: SOURCE_COMMIT,
      path: "design/equipment/lesser-healing-bottle.md",
      sha256:
        "0f42396a08389a7ccb921ba2dc398778a0870af8a151238811b66de0c7cb588d",
    },
  },
  "item-greater-healing-bottle": {
    id: "item-greater-healing-bottle",
    healing: 10,
    supplyDie: 4,
    source: {
      id: "item-greater-healing-bottle",
      repository: "bruceamoser/heroes-of-legend",
      commit: SOURCE_COMMIT,
      path: "design/equipment/greater-healing-bottle.md",
      sha256:
        "981b29855f56405816cfb0555dac87d99c205a8a41c63b3aaff1263feb6a85e7",
    },
  },
  "item-superior-healing-bottle": {
    id: "item-superior-healing-bottle",
    healing: 16,
    supplyDie: 4,
    source: {
      id: "item-superior-healing-bottle",
      repository: "bruceamoser/heroes-of-legend",
      commit: SOURCE_COMMIT,
      path: "design/equipment/superior-healing-bottle.md",
      sha256:
        "dbdf3a0e75e909f6dceee8111d94b0000e7b822179735e9e17ea8e3b0d6f9434",
    },
  },
};

export const HEALING_POTION_IDS = Object.freeze(Object.keys(definitions));

export function healingPotionAdapter(catalogId, catalog) {
  const definition = definitions[catalogId];
  if (!definition) throw new Error(`Unknown healing potion: ${catalogId}`);
  if (catalog?.sourceCommit !== SOURCE_COMMIT)
    throw new Error("Healing potion catalog source commit drifted.");
  const equipment = catalog.equipment?.find(
    (record) => record.id === catalogId,
  );
  if (
    !equipment ||
    equipment.inventoryDie !== definition.supplyDie ||
    equipment.source?.path !== definition.source.path ||
    equipment.source?.sha256 !== definition.source.sha256
  )
    throw new Error(`Healing potion source drifted: ${catalogId}`);
  const action = catalog.acquisitions?.find(
    (record) => record.id === ACTION.catalogId,
  );
  if (
    !action ||
    action.source?.path !== ACTION.source.path ||
    action.source?.sha256 !== ACTION.source.sha256
  )
    throw new Error("Healing potion action source drifted.");
  return structuredClone({ ...definition, action: ACTION });
}

const boolean = (value, label) => {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean.`);
  return value;
};

const actorIdentity = (value, label) => {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${label} must be a nonempty identity.`);
  return value;
};

const sameSnapshot = (left, right) => {
  if (Object.is(left, right)) return true;
  if (
    !left ||
    !right ||
    typeof left !== "object" ||
    typeof right !== "object" ||
    Array.isArray(left) !== Array.isArray(right)
  )
    return false;
  const leftKeys = Object.keys(left).sort(),
    rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && sameSnapshot(left[key], right[key]),
    )
  );
};

const assertOperationUnused = (turn, operationId, label) => {
  if (
    turn?.operations &&
    typeof turn.operations === "object" &&
    Object.hasOwn(turn.operations, operationId)
  )
    throw new Error(
      `${label} operation ID was already recorded; an authoritative receipt is required before resuming.`,
    );
};

function usableSurvival(state, label) {
  validateSurvival(state);
  if (["lastWords", "dead"].includes(state.status))
    throw new Error(`${label} cannot use or receive an ordinary potion.`);
  return state;
}

/**
 * Build a pure potion plan from explicit actor snapshots.
 * Self use requires one Actor identity and one coherent survival snapshot.
 * Its recipientTurn mirrors giverTurn after the Maneuver is spent, never the
 * caller's original unspent turn.
 * The coordinator must persist the operation and its receipt before applying
 * healing or asking for the supply die; the planner cannot recognize a replay
 * against an unchanged input snapshot.
 */
export function planHealingPotion({
  operationId,
  potionId,
  catalog,
  inventoryDie,
  giver,
  recipient,
  relation,
  adjacent,
  willing,
  capable,
  recipientOperationId,
  encounter = true,
  advisoryGeometry = false,
}) {
  const potion = healingPotionAdapter(potionId, catalog);
  if (inventoryDie !== potion.supplyDie)
    throw new Error(`This potion must have inventory d${potion.supplyDie}.`);
  if (!["self", "other"].includes(relation))
    throw new Error("Potion target relation must be self or other.");
  actorIdentity(giver?.actorId, "Giver identity");
  actorIdentity(recipient?.actorId, "Recipient identity");
  assertOperationUnused(giver.turn, operationId, "Giver");
  usableSurvival(giver.survival, "The giver");
  usableSurvival(recipient.survival, "The recipient");
  boolean(giver.ownTurn, "Giver own-turn status");
  boolean(capable, "Interruption capability");
  if (relation === "self") {
    if (giver.actorId !== recipient.actorId)
      throw new Error("A self recipient must be the giver.");
    if (!sameSnapshot(giver.survival, recipient.survival))
      throw new Error(
        "Self use requires one coherent giver and recipient survival snapshot.",
      );
  }
  if (relation === "other") {
    if (giver.actorId === recipient.actorId)
      throw new Error("Another recipient must have a distinct Actor identity.");
    if (!advisoryGeometry) boolean(adjacent, "Adjacency");
    boolean(willing, "Willingness");
    if (!advisoryGeometry && !adjacent)
      throw new Error("Another recipient must be adjacent.");
    if (!willing) throw new Error("Another recipient must be willing.");
  }

  const layout = handLayout(giver.items, giver.handCapacity ?? 2);
  if (layout.free < 1) throw new Error("The giver needs a free hand.");

  const recipientKind = recipient.kind ?? "character",
    healing = healingPlan({
      amount: potion.healing,
      current: recipient.survival.hp,
      max: recipient.survival.maxHp,
      lifeResistances: recipient.lifeResistances ?? [],
      recipientKind,
    });
  if (!healing.allowed)
    throw new Error(`The recipient cannot be healed: ${healing.reason}.`);
  const recipientAfter = receiveHealing(recipient.survival, healing.restored);
  if (!encounter)
    return {
      status: capable ? "ready" : "interrupted",
      potion,
      costs: {
        giver: { maneuver: 0, hp: 0, items: [] },
        recipient: { reaction: 0 },
      },
      targeting: {
        relation,
        adjacent: relation === "other" ? adjacent : null,
        willing,
      },
      order: [
        { kind: "heal", status: capable ? "planned" : "skipped" },
        { kind: "inventory-check", status: capable ? "pending" : "skipped" },
      ],
      giverTurn: null,
      recipientTurn: null,
      healing: capable ? healing : null,
      recipientSurvival: capable ? recipientAfter : null,
      inventory: capable
        ? {
            die: potion.supplyDie,
            retained: null,
            status: "pending",
            mustResolveAfter: "heal",
          }
        : null,
    };
  const reactionRequired = relation === "other" && recipient.survival.hp > 0;
  if (reactionRequired)
    assertOperationUnused(
      recipient.turn,
      recipientOperationId,
      "Recipient reaction",
    );

  const declared = declareAction(giver.turn, {
      operationId,
      sourceId: potion.action.id,
      category: "maneuver",
      conditions: giver.conditions ?? {},
      ownTurn: giver.ownTurn,
    }),
    continued = continueAction(
      declared,
      { hp: giver.survival.hp, items: {} },
      { operationId, capable, costs: { hp: 0, items: [] } },
    ),
    order = [
      { kind: "declare-giver-maneuver", status: "declared" },
      {
        kind: "continue-after-interruption",
        capable,
        status: continued.proceed ? "ready" : "interrupted",
      },
      {
        kind: "declare-recipient-reaction",
        required: reactionRequired,
        status: reactionRequired
          ? continued.proceed
            ? "pending"
            : "skipped"
          : "not-required",
      },
      { kind: "heal", status: continued.proceed ? "pending" : "skipped" },
      {
        kind: "inventory-check",
        status: continued.proceed ? "pending" : "skipped",
      },
    ];

  if (!continued.proceed)
    return {
      status: "interrupted",
      potion,
      costs: {
        giver: { maneuver: 1, hp: 0, items: [] },
        recipient: { reaction: 0 },
      },
      targeting: { relation, adjacent: null, willing: null },
      order,
      giverTurn: continued.state,
      giverResources: continued.resources,
      healing: null,
      recipientSurvival: null,
      recipientTurn: structuredClone(
        relation === "self" ? continued.state : recipient.turn,
      ),
      inventory: null,
    };

  let recipientTurn =
    relation === "self" ? structuredClone(continued.state) : recipient.turn;
  if (reactionRequired) {
    recipientTurn = declareAction(recipient.turn, {
      operationId: recipientOperationId,
      sourceId: potion.action.id,
      category: "reaction",
      conditions: recipient.conditions ?? {},
      ownTurn: false,
    });
    order[2].status = "declared";
  }
  order[3].status = "planned";
  order[4].status = "pending";

  return {
    status: "ready",
    potion,
    costs: {
      giver: { maneuver: 1, hp: 0, items: [] },
      recipient: { reaction: reactionRequired ? 1 : 0 },
    },
    targeting: {
      relation,
      adjacent: relation === "other" ? adjacent : null,
      willing: relation === "other" ? willing : null,
    },
    order,
    giverTurn: continued.state,
    giverResources: continued.resources,
    recipientTurn,
    healing,
    recipientSurvival: recipientAfter,
    inventory: {
      die: potion.supplyDie,
      retained: null,
      status: "pending",
      mustResolveAfter: "heal",
    },
  };
}

/** Resolve only after the ready plan's action, interruption, reaction and heal succeeded. */
export function resolveHealingPotionInventory(plan, { retained }) {
  if (!plan || plan.status !== "ready" || plan.inventory?.status !== "pending")
    throw new Error("The potion use has not successfully reached its check.");
  const result = inventoryCheck({ die: plan.inventory.die, retained });
  return {
    healing: structuredClone(plan.healing),
    recipientSurvival: structuredClone(plan.recipientSurvival),
    inventory: result,
  };
}
