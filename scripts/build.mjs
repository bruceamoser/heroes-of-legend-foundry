import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import {
  buildItemPackArtifacts,
  ITEM_PACK_DEFINITIONS,
  readItemPackCatalogs,
  verifyAuthoredItemPacks,
} from "./content/item-packs.mjs";

const root = new URL("../", import.meta.url);
const output = new URL("dist/heroes-of-legend/", root);
const artifacts = buildItemPackArtifacts(
  await readItemPackCatalogs(root),
);
await verifyAuthoredItemPacks(root, artifacts);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL("static/", root), output, { recursive: true });
await cp(new URL("src/", root), output, { recursive: true });
for (const pack of ITEM_PACK_DEFINITIONS) {
  await compilePack(
    fileURLToPath(new URL(`content/packs/${pack.directory}/`, root)),
    fileURLToPath(new URL(pack.path, output)),
  );
}
console.info(`Built ${fileURLToPath(output)}`);
