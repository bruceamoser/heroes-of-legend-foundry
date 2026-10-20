import { refillInventory } from "./inventory.mjs";

/** Apply one reviewed attempt to a copy of the character's play controls. */
export function workshopCraft({
  play,
  recipe,
  tier,
  items,
  instanceId,
  supplyId,
}) {
  const steps = { weak: 1, standard: 2, strong: 3 }[tier];
  if (!steps) throw new Error("Choose a crafting outcome.");
  const next = structuredClone(play);
  next.crafting ??= {};
  const previous = next.crafting[recipe.id] ?? {
    progress: 0,
    completed: 0,
    attempts: 0,
  };
  const state = { ...previous, attempts: previous.attempts + 1 };
  let message;
  next.inventory ??= { added: [], removed: [] };
  const add = () => {
    if (next.inventory.added.length >= 500)
      throw new Error("The character supports up to 500 added item stacks.");
    next.inventory.added.push({ id: recipe.product, quantity: 1, instanceId });
    return instanceId;
  };
  if (recipe.maximumDie) {
    if (!recipe.product)
      throw new Error("This supply recipe has no inventory product.");
    const item = supplyId
      ? items.find(
          (i) =>
            i.instanceId === supplyId &&
            i.catalogId === recipe.product &&
            i.quantity > 0,
        )
      : null;
    if (supplyId && !item)
      throw new Error("Choose an existing matching supply or a new supply.");
    const before = item?.inventoryDie ?? 0;
    // A recipe capped below an existing die never reduces that supply.
    const after =
      before >= recipe.maximumDie
        ? before
        : refillInventory({ die: before, steps, maximumDie: recipe.maximumDie })
            .after;
    const target = item?.instanceId ?? add();
    next.inventory.overrides ??= {};
    next.inventory.overrides[target] = {
      ...next.inventory.overrides[target],
      inventoryDie: after,
    };
    message = `${before ? "d" + before : "Empty"} → d${after}`;
  } else {
    const before = previous.progress >= recipe.target ? 0 : previous.progress;
    state.progress = Math.min(recipe.target, before + steps);
    if (state.progress >= recipe.target) {
      state.completed += 1;
      if (recipe.product) add();
    }
    message = `${state.progress} / ${recipe.target} progress${state.progress >= recipe.target ? (recipe.product ? " · Product added to inventory" : " · Project complete; no catalog inventory item") : ""}`;
  }
  next.crafting[recipe.id] = state;
  return { play: next, message, steps };
}
