import { readFile, stat, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import {
  formatCreatureArtReport,
  validateCreatureArt,
} from "./creature-art.mjs";

export async function validatePackage(root) {
  const creatureArt = await validateCreatureArt(root);
  const manifest = JSON.parse(
    await readFile(new URL("system.json", root), "utf8"),
  );
  if (manifest.id !== "heroes-of-legend")
    throw new Error("Unexpected package ID");
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(manifest.version))
    throw new Error("Invalid version");
  if (
    manifest.compatibility.minimum !== "14.367" ||
    manifest.compatibility.maximum !== "14"
  ) {
    throw new Error("Foundation must declare V14-only compatibility");
  }
  const packTypes = new Set([
    "Actor",
    "Adventure",
    "Cards",
    "Item",
    "JournalEntry",
    "Macro",
    "Playlist",
    "RollTable",
    "Scene",
  ]);
  const packNames = new Set(),
    packPaths = new Set();
  for (const pack of manifest.packs ?? []) {
    if (
      typeof pack.name !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pack.name) ||
      !packTypes.has(pack.type) ||
      pack.system !== manifest.id ||
      typeof pack.path !== "string"
    )
      throw new Error(`Invalid compendium declaration: ${pack.name}`);
    if (packNames.has(pack.name) || packPaths.has(pack.path))
      throw new Error(`Duplicate compendium declaration: ${pack.name}`);
    packNames.add(pack.name);
    packPaths.add(pack.path);
  }
  const files = [
    ...(manifest.esmodules ?? []),
    ...(manifest.styles ?? []),
    ...(manifest.languages?.map((language) => language.path) ?? []),
  ];
  const packs = manifest.packs?.map((pack) => pack.path) ?? [];
  const paths = [...files, ...packs];
  if (!manifest.esmodules?.length)
    throw new Error("Missing module entry point");
  for (const path of paths) {
    if (
      typeof path !== "string" ||
      isAbsolute(path) ||
      /[\\:%?#]/.test(path) ||
      path.split("/").some((part) => part === ".." || part === "." || !part)
    ) {
      throw new Error(`Unsafe package path: ${path}`);
    }
    const entry = await stat(new URL(path, root));
    if (files.includes(path) ? !entry.isFile() : !entry.isDirectory()) {
      throw new Error(`Invalid asset type: ${path}`);
    }
    if (path.endsWith(".json"))
      JSON.parse(await readFile(new URL(path, root), "utf8"));
  }
  for (const entry of await readdir(root, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (entry.isFile() && entry.name.endsWith(".mjs")) {
      execFileSync(
        process.execPath,
        ["--check", `${entry.parentPath}/${entry.name}`],
        { stdio: "pipe" },
      );
    }
  }
  console.info(
    `Validated creature art: ${formatCreatureArtReport(creatureArt)}`,
  );
  return manifest;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const manifest = await validatePackage(
    new URL("../dist/heroes-of-legend/", import.meta.url),
  );
  const metadata = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  if (manifest.version !== metadata.version)
    throw new Error("Package/manifest versions differ");
  console.info(`Validated ${manifest.id} ${manifest.version}`);
}
