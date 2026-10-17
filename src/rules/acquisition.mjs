/** Pure acquisition plans. Persist the returned inventory and receipts together. */
export function craftingPermissions(abilityIds, catalog) {
  const recipes = catalog.recipes
    .filter((r) => r.permissions.some((id) => abilityIds.includes(id)))
    .map((r) => r.id);
  return {
    capabilities: recipes.length ? ["compatible-crafting"] : [],
    compatibleRecipes: recipes,
  };
}
export function acquireAbility(state, abilityId, selection, catalog) {
  const adapter = catalog.acquisitions.find((a) => a.id === abilityId);
  if (!adapter) throw new Error(`Unreviewed acquisition ${abilityId}`);
  const next = structuredClone(state);
  next.items ??= [];
  next.recipes ??= [];
  next.acquisitionReceipts ??= [];
  if (next.acquisitionReceipts.some((r) => r.abilityId === abilityId))
    return { valid: true, state: next, errors: [], replayed: true };
  const errors = [];
  const itemIds = [...adapter.items],
    recipeIds = [...adapter.recipes];
  if (adapter.weaponChoice) {
    if (!adapter.weaponChoice.includes(selection.weapon))
      errors.push("Choose an allowed attack equipment option.");
    else if (selection.weapon === "melee")
      itemIds.push("item-ordinary-melee-weapon");
    else if (selection.weapon === "ranged")
      itemIds.push("item-ordinary-ranged-weapon", "item-ammunition-bundle");
  }
  if (adapter.recipeChoices) {
    const chosen = selection.recipes ?? [];
    const allowed = catalog.recipes
      .filter((r) => r.genericChoice && r.permissions.includes(abilityId))
      .map((r) => r.id);
    if (
      chosen.length !== adapter.recipeChoices ||
      new Set(chosen).size !== chosen.length ||
      chosen.some((id) => !allowed.includes(id))
    )
      errors.push(
        `Choose ${adapter.recipeChoices} distinct compatible ordinary recipes.`,
      );
    else recipeIds.push(...chosen);
  }
  const grants = [];
  for (const id of itemIds) {
    // Compatibility tags are reviewed item metadata, not inferred from display names.
    const existing = next.items.find(
      (i) => i.catalogId === id || i.compatibleWith?.includes(id),
    );
    if (existing) {
      grants.push({ catalogId: id, disposition: "already-owned" });
      continue;
    }
    const definition = catalog.equipment.find((i) => i.id === id);
    if (!definition) throw new Error(`Missing equipment ${id}`);
    const hands =
      definition.handChoices.length === 1
        ? definition.handChoices[0]
        : selection.meleeHands;
    if (
      definition.handChoices.length &&
      !definition.handChoices.includes(hands)
    ) {
      errors.push("Describe the melee weapon as one-handed or two-handed.");
      continue;
    }
    next.items.push({
      instanceId: `grant:${abilityId}:${id}`,
      catalogId: id,
      hands: definition.handChoices.length ? hands : 0,
      inventoryDie: definition.inventoryDie,
      quantity: 1,
      source: abilityId,
    });
    grants.push({ catalogId: id, disposition: "granted" });
  }
  for (const id of recipeIds) {
    if (!catalog.recipes.some((r) => r.id === id))
      throw new Error(`Missing recipe ${id}`);
    if (!next.recipes.includes(id)) next.recipes.push(id);
  }
  if (errors.length)
    return {
      valid: false,
      state: structuredClone(state),
      errors,
      replayed: false,
    };
  next.acquisitionReceipts.push({
    abilityId,
    sourceHash: adapter.source.sha256,
    selection: structuredClone(selection),
    grants,
    recipes: recipeIds,
  });
  return { valid: true, state: next, errors: [], replayed: false };
}
export function inventoryTotals(items, catalog, { wornOutfitId = null } = {}) {
  let bulk = 0;
  for (const item of items) {
    const definition = catalog.equipment.find((d) => d.id === item.catalogId);
    if (!definition) throw new Error(`Unknown equipment ${item.catalogId}`);
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1)
      throw new Error("Invalid quantity");
    bulk += definition.bulk * item.quantity;
    // Exactly one ordinary worn outfit is descriptive; spare outfits still count.
    if (
      item.instanceId === wornOutfitId &&
      item.catalogId === "item-travel-clothes"
    )
      bulk -= definition.bulk;
  }
  return { bulk };
}
