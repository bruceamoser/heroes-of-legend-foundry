import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  writeFile,
  rm,
  utimes,
  chmod,
  lstat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { validatePackage } from "./validate.mjs";
const repo = "https://github.com/bruceamoser/heroes-of-legend-foundry";
export function releaseLinks(version, tag = `v${version}`) {
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version) || tag !== `v${version}`)
    throw new Error("Release tag must equal v plus the package version.");
  return {
    manifest: `${repo}/releases/latest/download/system.json`,
    download: `${repo}/releases/download/${tag}/heroes-of-legend.zip`,
  };
}
export async function packageRelease({
  source,
  destination,
  tag,
  expectedVersion,
}) {
  const manifest = await validatePackage(pathToFileURL(`${source}/`));
  if (manifest.version !== expectedVersion)
    throw new Error("Package and manifest versions differ.");
  const links = releaseLinks(manifest.version, tag);
  const staging = await mkdtemp(join(tmpdir(), "hol-release-"));
  try {
    const root = join(staging, "package");
    await cp(source, root, { recursive: true });
    await writeFile(
      join(root, "system.json"),
      JSON.stringify({ ...manifest, ...links }, null, 2) + "\n",
    );
    const files = [];
    async function collect(directory, prefix = "") {
      for (const name of (await readdir(directory)).sort()) {
        const path = join(directory, name),
          relative = prefix + name,
          info = await lstat(path);
        if (
          info.isSymbolicLink() ||
          /[\r\n\\]/.test(relative) ||
          name.startsWith(".") ||
          ["node_modules", "worlds", "Config", "Logs"].includes(name)
        )
          throw new Error(`Unexpected release entry: ${relative}`);
        if (info.isDirectory()) await collect(path, `${relative}/`);
        else if (info.isFile()) {
          await utimes(
            path,
            new Date("2000-01-01T00:00:00Z"),
            new Date("2000-01-01T00:00:00Z"),
          );
          await chmod(path, 0o644);
          files.push(relative);
        } else throw new Error(`Unsupported release entry: ${relative}`);
      }
    }
    await collect(root);
    await mkdir(destination, { recursive: true });
    const archive = join(destination, "heroes-of-legend.zip");
    await rm(archive, { force: true });
    execFileSync("zip", ["-X", "-q", archive, "-@"], {
      cwd: root,
      input: files.join("\n") + "\n",
      env: { ...process.env, TZ: "UTC" },
    });
    const entries = execFileSync("unzip", ["-Z1", archive], {
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    if (JSON.stringify(entries) !== JSON.stringify(files))
      throw new Error("ZIP entries differ from the staged package.");
    const extracted = join(staging, "extracted");
    await mkdir(extracted);
    execFileSync("unzip", ["-q", archive, "-d", extracted]);
    await validatePackage(pathToFileURL(`${extracted}/`));
    for (const path of files)
      if (
        !(await readFile(join(root, path))).equals(
          await readFile(join(extracted, path)),
        )
      )
        throw new Error(`ZIP round-trip mismatch: ${path}`);
    await cp(join(root, "system.json"), join(destination, "system.json"));
    const sums = [];
    for (const name of ["system.json", "heroes-of-legend.zip"])
      sums.push(
        `${createHash("sha256")
          .update(await readFile(join(destination, name)))
          .digest("hex")}  ${name}`,
      );
    await writeFile(join(destination, "SHA256SUMS"), sums.join("\n") + "\n");
    return { version: manifest.version, files: files.length, ...links };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const metadata = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const result = await packageRelease({
    source: fileURLToPath(new URL("../dist/heroes-of-legend", import.meta.url)),
    destination: fileURLToPath(
      new URL("../release-artifacts", import.meta.url),
    ),
    tag: process.env.HOL_RELEASE_TAG ?? `v${metadata.version}`,
    expectedVersion: metadata.version,
  });
  console.info(
    `Packaged ${result.version}: ${result.files} files; extracted bytes and manifest validated.`,
  );
}
