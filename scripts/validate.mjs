import { readFile, stat, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

export async function validatePackage(root) {
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
