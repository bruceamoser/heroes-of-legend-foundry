import { generateWoundTables } from "./generate-wound-tables.mjs";
import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { validateNativeJournals } from "./validate-native-journals.mjs";
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
await validateNativeJournals(root);
await generateWoundTables(root, {check:true});
const artifacts = buildContentPackArtifacts(
  await readContentPackCatalogs(root),
);
await verifyAuthoredContentPacks(root, artifacts);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL("static/", root), output, { recursive: true });
// Creature and summon intake catalogs are build inputs; native play reads the
// Actor packs. Runtime creation/equipment/wounds still use their JSON catalogs.
for (const name of ["creatures"])
  await rm(new URL(`data/${name}.json`, output));
await cp(new URL("src/", root), output, { recursive: true });
const creatureArt = await validateCreatureArt(output);
for (const pack of CONTENT_PACK_DEFINITIONS) {
  await compilePack(
    fileURLToPath(new URL(`content/packs/${pack.directory}/`, root)),
    fileURLToPath(new URL(pack.path, output)),
  );
}
for (const name of ["player-rules", "da-rules"]) {
  await compilePack(fileURLToPath(new URL(`content/journals/${name}/`, root)), fileURLToPath(new URL(`packs/${name}`, output)));
}
await compilePack(fileURLToPath(new URL("content/tables/wounds/", root)), fileURLToPath(new URL("packs/wounds", output)));
console.info(
  `Built ${fileURLToPath(output)} with ${formatCreatureArtReport(creatureArt)}`,
);
