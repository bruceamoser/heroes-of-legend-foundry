import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);
const lock = JSON.parse(
  await readFile(new URL("content/source-lock.json", root)),
);
const source =
  process.env.HOL_RULES_REPO ??
  new URL("../../heroes-of-legend/", import.meta.url).pathname;
const records = lock.records
  .filter((r) => r.path.startsWith("design/rules/"))
  .map((r) => {
    const markdown = execFileSync(
      "git",
      ["-C", source, "show", `${lock.commit}:${r.path}`],
      { encoding: "utf8" },
    );
    if (createHash("sha256").update(markdown).digest("hex") !== r.sha256)
      throw new Error(`Source mismatch: ${r.path}`);
    return {
      id: "rule-" + r.path.split("/").at(-1).replace(".md", ""),
      title: markdown.match(/^# (.+)/m)?.[1],
      markdown,
      source: { path: r.path, sha256: r.sha256 },
    };
  });
await writeFile(
  new URL("web/data/journals.json", root),
  JSON.stringify({ sourceCommit: lock.commit, records }, null, 2) + "\n",
);
console.log(`Exported ${records.length} pinned rule journals.`);
