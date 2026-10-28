import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildContentPackArtifacts,
  readContentPackCatalogs,
  verifyAuthoredContentPacks,
} from "./content/content-packs.mjs";

const root = new URL("../", import.meta.url);

export async function generateContentPacks({
  check = false,
  rootUrl = root,
} = {}) {
  const artifacts = buildContentPackArtifacts(
    await readContentPackCatalogs(rootUrl),
  );
  if (check) {
    await verifyAuthoredContentPacks(rootUrl, artifacts);
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
  const artifacts = await generateContentPacks({ check });
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
