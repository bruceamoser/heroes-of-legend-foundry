import { fileURLToPath, pathToFileURL } from "node:url";
import { generateContentPacks } from "./generate-content-packs.mjs";

const root = new URL("../", import.meta.url);

export async function generateItemPacks({
  check = false,
  rootUrl = root,
} = {}) {
  return generateContentPacks({ check, rootUrl });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const check = process.argv.includes("--check");
  const artifacts = await generateItemPacks({ check });
  console.info(
    check
      ? "Verified authored content packs"
      : "Generated authored content packs",
    {
      abilities: artifacts.documents.abilities.length,
      equipment: artifacts.documents.equipment.length,
      creatures: artifacts.documents.creatures.length,
      sourceCommit: artifacts.index.sourceCommit,
      output: fileURLToPath(new URL("content/packs/", root)),
    },
  );
}
