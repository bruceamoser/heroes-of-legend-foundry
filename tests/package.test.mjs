import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { validatePackage } from "../scripts/validate.mjs";

async function fixture(t, mutate) {
  const directory = await mkdtemp(join(tmpdir(), "hol-package-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = pathToFileURL(`${directory}/`);
  await cp(new URL("../dist/heroes-of-legend/", import.meta.url), root, { recursive: true });
  const manifest = JSON.parse(await readFile(new URL("system.json", root), "utf8"));
  mutate(manifest);
  await writeFile(new URL("system.json", root), JSON.stringify(manifest));
  return root;
}

test("built package resolves every declared asset", async () => {
  await validatePackage(new URL("../dist/heroes-of-legend/", import.meta.url));
});
test("missing assets prevent distribution", async t => {
  const root = await fixture(t, m => { m.esmodules = ["missing.mjs"]; });
  await assert.rejects(validatePackage(root), { code: "ENOENT" });
});
test("asset paths cannot escape the package", async t => {
  const root = await fixture(t, m => { m.styles = ["../outside.css"]; });
  await assert.rejects(validatePackage(root), /Unsafe package path/);
});
