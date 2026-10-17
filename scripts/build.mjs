import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import {
  buildContentPackArtifacts,
  CONTENT_PACK_DEFINITIONS,
  readContentPackCatalogs,
  verifyAuthoredContentPacks,
} from "./content/content-packs.mjs";
import {
  formatCreatureArtReport,
  validateCreatureArt,
} from "./creature-art.mjs";

const root = new URL("../", import.meta.url);
const output = new URL("dist/heroes-of-legend/", root);
const artifacts = buildContentPackArtifacts(
  await readContentPackCatalogs(root),
);
await verifyAuthoredContentPacks(root, artifacts);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL("static/", root), output, { recursive: true });
await cp(new URL("src/", root), output, { recursive: true });
const creatureArt = await validateCreatureArt(output);
for (const pack of CONTENT_PACK_DEFINITIONS) {
  await compilePack(
    fileURLToPath(new URL(`content/packs/${pack.directory}/`, root)),
    fileURLToPath(new URL(pack.path, output)),
  );
}
console.info(
  `Built ${fileURLToPath(output)} with ${formatCreatureArtReport(creatureArt)}`,
);
