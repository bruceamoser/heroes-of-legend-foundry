let catalogs;
export async function loadCatalogs() {
  catalogs ??= Promise.all(
    ["choices", "inventory"].map(async (name) => {
      const response = await fetch(
        `systems/heroes-of-legend/data/${name}.json`,
      );
      if (!response.ok) throw new Error(`Cannot load ${name} catalog`);
      return response.json();
    }),
  )
    .then(([choices, inventory]) => ({
      choices: choices.records,
      inventory,
      commit: choices.sourceCommit,
    }))
    .catch((error) => {
      catalogs = null;
      throw error;
    });
  return catalogs;
}
