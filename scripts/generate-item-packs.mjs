import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildItemPackArtifacts,
  readItemPackCatalogs,
  verifyAuthoredItemPacks,
} from "./content/item-packs.mjs";

const root = new URL("../", import.meta.url);

export async function generateItemPacks({
  check = false,
  rootUrl = root,
} = {}) {
  const artifacts = buildItemPackArtifacts(
    await readItemPackCatalogs(rootUrl),
  );
  if (check) {
    await verifyAuthoredItemPacks(rootUrl, artifacts);
    return artifacts;
  }
  const output = new URL("content/packs/", rootUrl);
  await rm(output, { recursive: true, force: true });
  for (const [path, content] of artifacts.files) {
    const target = new URL(path, output);
    await mkdir(new URL("./", target), { recursive: true });
    await writeFile(target, content);
  }
  return artifacts;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const check = process.argv.includes("--check");
  const artifacts = await generateItemPacks({ check });
  console.info(
    check ? "Verified authored Item packs" : "Generated authored Item packs",
    {
      abilities: artifacts.documents.abilities.length,
      equipment: artifacts.documents.equipment.length,
      sourceCommit: artifacts.index.sourceCommit,
      output: check
        ? fileURLToPath(new URL("content/packs/", root))
        : fileURLToPath(new URL("content/packs/", root)),
    },
  );
}
