import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  profileFingerprint,
  profilePaths,
  profileValue,
} from "../src/rules/profile-update.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
// Software tree whose packs were generated from the d67 rulebook snapshot.
// Pin the object so regeneration remains stable after main advances.
const SOURCE_REF = "9030f69fc7d7bbae81c5f13c9aa3bfe10f151011";
const OLD_COMMIT = "d67e046466bdd5052360b96ed91861d607091446";

export function generateProfileUpdateBases() {
  const profiles = {};
  for (const type of ["creature", "summon"]) {
    const directory = `content/packs/${type}s`;
    const paths = execFileSync(
      "git",
      ["ls-tree", "-r", "--name-only", SOURCE_REF, directory],
      { cwd: root, encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter((path) => path.endsWith(".json"));
    for (const path of paths) {
      const source = JSON.parse(
        execFileSync("git", ["show", `${SOURCE_REF}:${path}`], {
          cwd: root,
          encoding: "utf8",
        }),
      );
      const flags = source.flags?.["heroes-of-legend"];
      if (
        source.type !== type ||
        flags?.sourceCommit !== OLD_COMMIT ||
        !flags.catalogId ||
        !flags.source?.sha256
      ) {
        throw new Error(`Unexpected old profile provenance: ${path}`);
      }
      profiles[flags.catalogId] = {
        sourceSha: flags.source.sha256,
        fields: Object.fromEntries(
          profilePaths(type, source).map((field) => [
            field,
            profileFingerprint(profileValue(source, field)),
          ]),
        ),
      };
    }
  }
  if (Object.keys(profiles).length !== 265)
    throw new Error("Expected 192 creatures and 73 summons.");
  return {
    sourceCommit: OLD_COMMIT,
    profiles: Object.fromEntries(
      Object.entries(profiles).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const target = new URL(
    "../static/data/profile-update-bases.json",
    import.meta.url,
  );
  const content = `${JSON.stringify(generateProfileUpdateBases(), null, 2)}\n`;
  if (process.argv.includes("--check")) {
    if ((await readFile(target, "utf8")) !== content)
      throw new Error("Profile update baselines changed.");
  } else await writeFile(target, content);
}
