import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
// Generated fixtures only; never write a live Foundry database from this script.
for (const kind of ["actors", "journal"]) {
  const source = new URL(`../tests/fixtures/packs/${kind}/`, import.meta.url);
  const output = new URL(
    `../test-results/pack-probe/${kind}/`,
    import.meta.url,
  );
  await rm(output, { recursive: true, force: true });
  await compilePack(fileURLToPath(source), fileURLToPath(output));
  console.info(`Staged ${fileURLToPath(output)}`);
}
